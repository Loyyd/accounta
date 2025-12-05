import sqlite3
import os
import sys
from passlib.hash import bcrypt

# Correctly construct the absolute path to the database file
db_path = os.path.abspath(os.path.join(os.getcwd(), 'server', 'instance', 'dev.db'))

def add_user(username, password):
    """Adds a new user to the database."""
    if len(password.encode('utf-8')) > 72:
        print("Password is too long. It will be truncated to 72 bytes.")
        password = password.encode('utf-8')[:72].decode('utf-8', 'ignore')

    password_hash = bcrypt.hash(password)

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, password_hash))
        conn.commit()
        conn.close()
        print(f"User '{username}' added successfully.")
    except sqlite3.IntegrityError:
        print(f"Error: Username '{username}' already exists.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python add_user.py <username> <password>")
        sys.exit(1)

    username = sys.argv[1]
    password = sys.argv[2]
    add_user(username, password)
