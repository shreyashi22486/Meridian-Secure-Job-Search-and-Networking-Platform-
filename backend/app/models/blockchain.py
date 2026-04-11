"""
Blockchain model — stores mined blocks for tamper-evident audit log integrity.

Each block contains:
- A Merkle root of the audit log entries it covers
- A proof-of-work nonce satisfying the difficulty requirement
- A hash linking to the previous block (chain)
- A signed checkpoint for independent verification
"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base


class Block(Base):
    """
    Represents a mined block in the audit log blockchain.

    Blockchain properties simulated:
    - Immutability: hash chaining + PoW makes tampering computationally expensive
    - Security: SHA-256 hashes + PKI signatures
    - Transparency: all blocks and entries are auditable
    - Decentralization: chain exportable as signed JSON for independent verification
    - Data Replication: checkpoint files on disk for cross-verification
    """
    __tablename__ = "blocks"

    block_number = Column(Integer, primary_key=True)
    prev_block_hash = Column(String(64), nullable=False)
    merkle_root = Column(String(64), nullable=False)
    nonce = Column(Integer, nullable=False)
    difficulty = Column(Integer, nullable=False, default=2)
    block_hash = Column(String(64), nullable=False)

    # Which audit log entries are in this block
    entry_ids = Column(JSONB, nullable=False, default=list)
    entry_count = Column(Integer, nullable=False, default=0)

    # PKI signature of the block hash
    signature = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<Block #{self.block_number} hash={self.block_hash[:12]}... entries={self.entry_count}>"
