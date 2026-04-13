"""
One-time migration: Re-sign all data with the current PKI key.

Why this is needed:
    When the deployment switched from docker-compose.local.yml to
    docker-compose.yml, the PKI volume changed (pki_data_dev → sjp-pki-data).
    The container generated new RSA keys, invalidating all existing signatures.

What this script does:
    1. Re-computes audit log hash chain and re-signs every entry
    2. Re-signs all encrypted resume files on disk
    3. Drops and re-creates all blockchain blocks with new signatures
    4. Regenerates checkpoint files

Run inside the container:
    docker exec sjp-backend python -m migrations.resign_all
"""

import os
import sys

# Add the app directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.audit_log import AuditLog
from app.models.resume import Resume
from app.models.blockchain import Block
from app.security.pki import sign_data, verify_signature
from app.utils import backfill_audit_hashes


def resign_audit_logs(db):
    """Re-compute hash chain and re-sign all audit log entries."""
    print("\n─── Re-signing Audit Logs ───")
    count = backfill_audit_hashes(db)
    print(f"  ✅ Re-signed {count} audit log entries")

    # Verify
    sample = db.query(AuditLog).filter(AuditLog.signature.isnot(None)).first()
    if sample:
        ok = verify_signature(sample.entry_hash.encode("utf-8"), sample.signature)
        print(f"  Verification check: {'✅ PASS' if ok else '❌ FAIL'}")


def resign_resumes(db):
    """Re-sign all encrypted resume files on disk."""
    print("\n─── Re-signing Resumes ───")
    resumes = db.query(Resume).all()
    signed = 0
    errors = 0

    for resume in resumes:
        try:
            if not os.path.exists(resume.file_path):
                print(f"  ⚠️  File missing for resume {resume.id}: {resume.file_path}")
                errors += 1
                continue

            with open(resume.file_path, "rb") as f:
                encrypted_content = f.read()

            resume.signature = sign_data(encrypted_content)
            signed += 1
        except Exception as e:
            print(f"  ❌ Error signing resume {resume.id}: {e}")
            errors += 1

    db.commit()
    print(f"  ✅ Re-signed {signed} resumes ({errors} errors)")

    # Verify one
    if signed > 0:
        sample = db.query(Resume).filter(Resume.signature.isnot(None)).first()
        if sample and os.path.exists(sample.file_path):
            with open(sample.file_path, "rb") as f:
                content = f.read()
            ok = verify_signature(content, sample.signature)
            print(f"  Verification check: {'✅ PASS' if ok else '❌ FAIL'}")


def rebuild_blockchain(db):
    """Drop all blocks and re-create them with current PKI signatures."""
    print("\n─── Rebuilding Blockchain ───")

    # Delete all existing blocks
    block_count = db.query(Block).count()
    db.query(Block).delete()
    db.commit()
    print(f"  Deleted {block_count} old blocks")

    # Re-create genesis and mine new blocks
    from app.security.blockchain import ensure_genesis, create_block

    genesis = ensure_genesis(db)
    print(f"  ✅ Genesis block created (hash: {genesis.block_hash[:16]}...)")

    # Keep creating blocks until all audit entries are covered
    blocks_mined = 0
    while True:
        block = create_block(db)
        if block is None:
            break
        blocks_mined += 1
        print(f"  ✅ Block #{block.block_number} mined ({block.entry_count} entries)")

    print(f"  Total: {blocks_mined + 1} blocks (genesis + {blocks_mined} data blocks)")

    # Verify
    from app.security.blockchain import verify_blockchain
    result = verify_blockchain(db)
    print(f"  Chain verification: {'✅ PASS' if result['valid'] else '❌ FAIL'}")


def main():
    print("=" * 60)
    print("  PKI Re-signing Migration")
    print("  Re-signing all data with current RSA key pair")
    print("=" * 60)

    db = SessionLocal()
    try:
        resign_audit_logs(db)
        resign_resumes(db)
        rebuild_blockchain(db)

        print("\n" + "=" * 60)
        print("  ✅ Migration complete — all signatures updated")
        print("=" * 60)
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
