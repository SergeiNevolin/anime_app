#!/usr/bin/env python3
"""Wait for PostgreSQL to be ready before running migrations."""

import asyncio
import asyncpg
import os
import sys
import time


async def wait_for_db() -> bool:
    url = os.environ.get(
        "DATABASE_URL", "postgresql+asyncpg://anime:anime@postgres:5432/anime"
    )
    # Convert asyncpg URL
    url = url.replace("postgresql+asyncpg://", "postgresql://")

    for i in range(60):
        try:
            conn = await asyncpg.connect(url)
            await conn.close()
            print("PostgreSQL is ready!")
            return True
        except Exception as e:
            print(f"Waiting for postgres... ({i+1}/60)")
            time.sleep(2)
    return False


def main() -> int:
    if not asyncio.run(wait_for_db()):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())