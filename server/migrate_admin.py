#!/usr/bin/env python3
"""
Migration script to add is_admin column to users table
"""
from app import app, db, User

def migrate():
    with app.app_context():
        # Check if is_admin column exists
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        columns = [col['name'] for col in inspector.get_columns('users')]
        
        if 'is_admin' not in columns:
            # Add is_admin column using raw SQL
            with db.engine.connect() as conn:
                conn.execute(db.text('ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0'))
                conn.commit()
            print('✅ Added is_admin column to users table')
        else:
            print('✅ is_admin column already exists')
        
        # Make Konrad an admin for testing
        user = User.query.filter_by(username='Konrad').first()
        if user:
            user.is_admin = True
            db.session.commit()
            print(f'✅ Made {user.username} an admin')
        else:
            print('ℹ️ User Konrad not found - you can create an admin user manually')

if __name__ == '__main__':
    migrate()
