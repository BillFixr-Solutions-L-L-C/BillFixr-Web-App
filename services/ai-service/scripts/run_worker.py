from __future__ import annotations

import argparse
import time

from app.config import get_settings
from app.processing import ProcessingService


def main() -> None:
    parser = argparse.ArgumentParser(description="Process queued BillFixr extraction jobs.")
    parser.add_argument("--once", action="store_true", help="Process one batch and exit.")
    parser.add_argument("--interval", type=float, default=5.0, help="Polling interval in seconds.")
    parser.add_argument("--limit", type=int, default=10, help="Max jobs per batch.")
    parser.add_argument("--use-ai", action="store_true", help="Use configured AI extraction provider.")
    args = parser.parse_args()

    service = ProcessingService(get_settings())
    while True:
        count = service.process_queued_jobs(use_ai=args.use_ai, limit=args.limit)
        print(f"processed_jobs={count}")
        if args.once:
            return
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
