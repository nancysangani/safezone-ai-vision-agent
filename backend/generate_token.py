"""
generate_token.py — Development utility

Generates a Stream access token for the React frontend.
In production, this runs server-side in your auth endpoint.

Usage:
  uv run --env-file .env generate_token.py
  uv run --env-file .env generate_token.py --user-id admin_user
"""

import argparse
import os
import sys

try:
    from getstream import Stream
except ImportError:
    print("❌ Missing dependency. Run: uv add getstream")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Generate Stream access token")
    parser.add_argument("--user-id", default="safezone-admin", help="User ID for the token")
    args = parser.parse_args()

    api_key    = os.getenv("STREAM_API_KEY")
    api_secret = os.getenv("STREAM_API_SECRET")

    if not api_key or not api_secret:
        print("❌ Error: STREAM_API_KEY or STREAM_API_SECRET not found in environment")
        print("   Make sure you have a .env file with these values")
        sys.exit(1)

    client = Stream(api_key, api_secret)
    token  = client.create_token(args.user_id)

    print(f"\n{'='*60}")
    print(f"✅ Stream Access Token for user: {args.user_id}")
    print(f"{'='*60}")
    print(f"\nAPI Key:  {api_key}")
    print(f"User ID:  {args.user_id}")
    print(f"\nToken:")
    print(token)
    print(f"\n{'='*60}")
    print("Copy the token above and paste it into frontend/.env.local")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
