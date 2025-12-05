import sqlite3
import os

# Correctly construct the absolute path to the database file
db_path = os.path.abspath(os.path.join(os.getcwd(), 'server', 'instance', 'dev.db'))

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT username FROM users")
    users = cursor.fetchall()
    conn.close()

    if users:
        print("Here are the usernames found in the database:")
        for user in users:
            print(f"- {user[0]}")
    else:
        print("No users found in the database.")
except sqlite3.OperationalError as e:
    print(f"Error accessing the database: {e}")
    print(f"Please ensure the database file exists at: {db_path}")

