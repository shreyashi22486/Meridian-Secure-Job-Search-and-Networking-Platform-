"""
Blockchain engine — Merkle trees, Proof of Work, block mining,
checkpoint management, and chain verification.

Simulates core blockchain concepts:
- Merkle Tree: cryptographic summary of all entries in a block
- Proof of Work: nonce mining with configurable difficulty
- Chain Linking: each block's hash includes the previous block's hash
- Checkpoints: signed snapshots on disk for data replication simulation
- Export: full chain as signed JSON for independent verification
"""

import hashlib
import json
import os
from datetime import datetime, timezone

from sqlalchemy.orm import Session as DBSession

from app.models.blockchain import Block
from app.models.audit_log import AuditLog
from app.security.pki import sign_data, verify_signature

# ─── Configuration ──────────────────────────────────────────────────────

BLOCK_SIZE = 10         # Number of audit entries per block
DIFFICULTY = 2          # Number of leading zeros required in block hash
CHECKPOINT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "blockchain")


# ─── Merkle Tree ────────────────────────────────────────────────────────

def build_merkle_tree(hashes: list[str]) -> str:
    """
    Build a Merkle tree from a list of hashes and return the root.

    A Merkle tree is a binary hash tree where:
    - Leaf nodes are the input hashes
    - Each parent is SHA-256(left_child + right_child)
    - If odd number of nodes, the last is duplicated

    This allows efficient proof that a specific entry belongs to a block.
    """
    if not hashes:
        return "0" * 64

    # Leaf level
    level = list(hashes)

    while len(level) > 1:
        next_level = []
        for i in range(0, len(level), 2):
            left = level[i]
            right = level[i + 1] if i + 1 < len(level) else level[i]  # duplicate if odd
            combined = hashlib.sha256(
                (left + right).encode("utf-8")
            ).hexdigest()
            next_level.append(combined)
        level = next_level

    return level[0]


# ─── Proof of Work ──────────────────────────────────────────────────────

def mine_block(block_header: str, difficulty: int) -> tuple[int, str]:
    """
    Find a nonce such that SHA-256(block_header + nonce) starts with
    `difficulty` leading zeros.

    This is the core Proof of Work algorithm — computationally expensive
    to find, trivial to verify.

    Returns (nonce, block_hash).
    """
    target = "0" * difficulty
    nonce = 0

    while True:
        candidate = f"{block_header}|{nonce}"
        block_hash = hashlib.sha256(candidate.encode("utf-8")).hexdigest()
        if block_hash.startswith(target):
            return nonce, block_hash
        nonce += 1


# ─── Block Creation ─────────────────────────────────────────────────────

def create_block(db: DBSession) -> Block | None:
    """
    Create a new block from unblocked audit log entries.

    Pipeline:
    1. Find the latest block (or genesis)
    2. Gather unblocked entries (up to BLOCK_SIZE)
    3. Build Merkle tree from their hashes
    4. Mine the block (Proof of Work)
    5. Sign and save the block
    6. Save checkpoint to disk
    """
    # 1. Get latest block
    latest_block = db.query(Block).order_by(Block.block_number.desc()).first()

    if latest_block:
        prev_block_hash = latest_block.block_hash
        next_block_num = latest_block.block_number + 1
        # Get entries after the last block's entries
        last_entry_id = max(latest_block.entry_ids) if latest_block.entry_ids else 0
    else:
        prev_block_hash = "0" * 64  # Genesis
        next_block_num = 1
        last_entry_id = 0

    # 2. Gather unblocked entries
    entries = (
        db.query(AuditLog)
        .filter(AuditLog.id > last_entry_id, AuditLog.entry_hash.isnot(None))
        .order_by(AuditLog.id.asc())
        .limit(BLOCK_SIZE)
        .all()
    )

    if not entries:
        return None  # Nothing to mine

    entry_ids = [e.id for e in entries]
    entry_hashes = [e.entry_hash for e in entries]

    # 3. Build Merkle tree
    merkle_root = build_merkle_tree(entry_hashes)

    # 4. Construct block header and mine
    now = datetime.now(timezone.utc)
    block_header = f"{next_block_num}|{prev_block_hash}|{merkle_root}|{now.isoformat()}"
    nonce, block_hash = mine_block(block_header, DIFFICULTY)

    # 5. Sign the block hash
    try:
        signature = sign_data(block_hash.encode("utf-8"))
    except Exception:
        signature = None

    # 6. Create and save block
    block = Block(
        block_number=next_block_num,
        prev_block_hash=prev_block_hash,
        merkle_root=merkle_root,
        nonce=nonce,
        difficulty=DIFFICULTY,
        block_hash=block_hash,
        entry_ids=entry_ids,
        entry_count=len(entry_ids),
        signature=signature,
        created_at=now,
    )
    db.add(block)
    db.commit()
    db.refresh(block)

    # 7. Save checkpoint to disk
    save_checkpoint(block)

    return block


def maybe_create_block(db: DBSession) -> Block | None:
    """
    Check if there are enough unblocked entries to mine a new block.
    Called automatically after each audit log entry is written.
    """
    latest_block = db.query(Block).order_by(Block.block_number.desc()).first()
    last_entry_id = max(latest_block.entry_ids) if (latest_block and latest_block.entry_ids) else 0

    unblocked_count = (
        db.query(AuditLog)
        .filter(AuditLog.id > last_entry_id, AuditLog.entry_hash.isnot(None))
        .count()
    )

    if unblocked_count >= BLOCK_SIZE:
        return create_block(db)
    return None


# ─── Genesis Block ──────────────────────────────────────────────────────

def ensure_genesis(db: DBSession) -> Block:
    """Create genesis block (#0) if it doesn't exist."""
    genesis = db.query(Block).filter(Block.block_number == 0).first()
    if genesis:
        return genesis

    now = datetime.now(timezone.utc)
    block_header = f"0|{'0' * 64}|{'0' * 64}|{now.isoformat()}"
    nonce, block_hash = mine_block(block_header, DIFFICULTY)

    try:
        signature = sign_data(block_hash.encode("utf-8"))
    except Exception:
        signature = None

    genesis = Block(
        block_number=0,
        prev_block_hash="0" * 64,
        merkle_root="0" * 64,
        nonce=nonce,
        difficulty=DIFFICULTY,
        block_hash=block_hash,
        entry_ids=[],
        entry_count=0,
        signature=signature,
        created_at=now,
    )
    db.add(genesis)
    db.commit()
    db.refresh(genesis)

    save_checkpoint(genesis)
    return genesis


# ─── Chain Verification ─────────────────────────────────────────────────

def verify_blockchain(db: DBSession) -> dict:
    """
    Full blockchain verification:
    1. Walk blocks in order, verify prev_block_hash linkage
    2. Re-compute Merkle root from actual entry hashes
    3. Verify Proof of Work (block hash starts with correct zeros)
    4. Verify PKI signature on each block
    """
    blocks = db.query(Block).order_by(Block.block_number.asc()).all()

    if not blocks:
        return {"valid": True, "blocks_verified": 0, "message": "No blocks to verify"}

    results = []
    prev_hash = "0" * 64

    for block in blocks:
        errors = []

        # 1. Check chain linkage
        if block.prev_block_hash != prev_hash:
            errors.append("prev_block_hash mismatch")

        # 2. Verify Merkle root (skip genesis)
        if block.block_number > 0 and block.entry_ids:
            entries = (
                db.query(AuditLog)
                .filter(AuditLog.id.in_(block.entry_ids))
                .order_by(AuditLog.id.asc())
                .all()
            )
            actual_hashes = [e.entry_hash for e in entries if e.entry_hash]
            expected_merkle = build_merkle_tree(actual_hashes)
            if expected_merkle != block.merkle_root:
                errors.append("merkle_root mismatch")

        # 3. Verify Proof of Work
        target = "0" * block.difficulty
        if not block.block_hash.startswith(target):
            errors.append("PoW invalid (hash doesn't meet difficulty)")

        # 4. Verify PKI signature
        if block.signature:
            try:
                if not verify_signature(block.block_hash.encode("utf-8"), block.signature):
                    errors.append("PKI signature invalid")
            except Exception:
                errors.append("PKI signature verification failed")

        results.append({
            "block_number": block.block_number,
            "block_hash": block.block_hash[:16] + "...",
            "valid": len(errors) == 0,
            "errors": errors,
        })

        prev_hash = block.block_hash

    all_valid = all(r["valid"] for r in results)
    return {
        "valid": all_valid,
        "blocks_verified": len(results),
        "message": "Blockchain integrity verified" if all_valid else "Tampering detected",
        "blocks": results,
    }


# ─── Checkpoints (Data Replication Simulation) ──────────────────────────

def save_checkpoint(block: Block) -> None:
    """
    Save a signed checkpoint file for a block.
    Acts as an independent copy of the block data (replication simulation).
    """
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)

    checkpoint = {
        "block_number": block.block_number,
        "prev_block_hash": block.prev_block_hash,
        "merkle_root": block.merkle_root,
        "nonce": block.nonce,
        "difficulty": block.difficulty,
        "block_hash": block.block_hash,
        "entry_ids": block.entry_ids,
        "entry_count": block.entry_count,
        "created_at": block.created_at.isoformat(),
        "signature": block.signature,
    }

    filepath = os.path.join(CHECKPOINT_DIR, f"block_{block.block_number:06d}.json")
    with open(filepath, "w") as f:
        json.dump(checkpoint, f, indent=2)


def verify_checkpoints(db: DBSession) -> dict:
    """
    Cross-verify database blocks against checkpoint files on disk.
    Detects if either the DB or the files have been tampered with.
    """
    blocks = db.query(Block).order_by(Block.block_number.asc()).all()
    results = []

    for block in blocks:
        filepath = os.path.join(CHECKPOINT_DIR, f"block_{block.block_number:06d}.json")

        if not os.path.exists(filepath):
            results.append({
                "block_number": block.block_number,
                "match": False,
                "error": "Checkpoint file missing",
            })
            continue

        try:
            with open(filepath, "r") as f:
                checkpoint = json.load(f)

            mismatches = []
            if checkpoint["block_hash"] != block.block_hash:
                mismatches.append("block_hash")
            if checkpoint["merkle_root"] != block.merkle_root:
                mismatches.append("merkle_root")
            if checkpoint["prev_block_hash"] != block.prev_block_hash:
                mismatches.append("prev_block_hash")
            if checkpoint["nonce"] != block.nonce:
                mismatches.append("nonce")
            if checkpoint["entry_ids"] != block.entry_ids:
                mismatches.append("entry_ids")

            results.append({
                "block_number": block.block_number,
                "match": len(mismatches) == 0,
                "mismatches": mismatches if mismatches else None,
            })
        except Exception as e:
            results.append({
                "block_number": block.block_number,
                "match": False,
                "error": str(e),
            })

    all_match = all(r["match"] for r in results) if results else True
    return {
        "valid": all_match,
        "blocks_checked": len(results),
        "message": "All checkpoints match database" if all_match else "Checkpoint mismatch detected",
        "blocks": results,
    }


# ─── Chain Export (Decentralization Simulation) ─────────────────────────

def export_chain(db: DBSession) -> dict:
    """
    Export the entire blockchain as a verifiable JSON structure.
    Anyone with this export can independently verify the chain
    without needing database access (decentralization simulation).
    """
    blocks = db.query(Block).order_by(Block.block_number.asc()).all()

    chain_data = {
        "chain_length": len(blocks),
        "exported_at": datetime.now(timezone.utc).isoformat() + "Z",
        "blocks": [],
    }

    for block in blocks:
        # Get entries for this block
        entries = []
        if block.entry_ids:
            logs = (
                db.query(AuditLog)
                .filter(AuditLog.id.in_(block.entry_ids))
                .order_by(AuditLog.id.asc())
                .all()
            )
            entries = [
                {
                    "id": log.id,
                    "action": log.action,
                    "entry_hash": log.entry_hash,
                    "prev_hash": log.prev_hash,
                }
                for log in logs
            ]

        chain_data["blocks"].append({
            "block_number": block.block_number,
            "prev_block_hash": block.prev_block_hash,
            "merkle_root": block.merkle_root,
            "nonce": block.nonce,
            "difficulty": block.difficulty,
            "block_hash": block.block_hash,
            "entry_count": block.entry_count,
            "created_at": block.created_at.isoformat() + "Z",
            "signature": block.signature,
            "entries": entries,
        })

    # Sign the entire export
    export_json = json.dumps(chain_data, sort_keys=True)
    try:
        chain_data["export_signature"] = sign_data(export_json.encode("utf-8"))
    except Exception:
        chain_data["export_signature"] = None

    return chain_data
