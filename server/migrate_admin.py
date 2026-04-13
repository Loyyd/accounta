#!/usr/bin/env python3
"""
Grant admin access to an existing user.
"""
import sys

from app import User, app, db


def grant_admin(username):
    with app.app_context():
        user = User.query.filter_by(username=username).first()
        if not user:
            print(f'User "{username}" not found')
            return 1

        user.is_admin = True
        db.session.commit()
        print(f'Granted admin access to "{username}"')
        return 0


if __name__ == "__main__":
    target_username = sys.argv[1] if len(sys.argv) > 1 else "Konrad"
    raise SystemExit(grant_admin(target_username))
