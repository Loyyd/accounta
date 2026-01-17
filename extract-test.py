import sys

# --- Challenge Data ---
e = 5
alice_n = 105809507955850449608538293817470449109
# This 'm_int' is the RSA ciphertext (the encrypted key)
c_rsa   = 315971781879435631453266619927156525572

# The symmetric ciphertext (the encrypted flag)
ciphertext_blob = b'\xc4\xdd\xb8\\\xbb\xe0u\xe7\xd2\xeb\x1a\xf6\xb6\xd7K\x03\xd3\xd1\xbeh\x97\xfbs\xe7\xfd\xef\x11\xe3\x87\xc0A\x15\xe9\xe3\xe9\x04\xc7\xfb6\xe6\xc3\xf3'

# --- 1. Use the Factors we found ---
p = 169661
q = 623652506797970362125286859192569

print(f"Using factors: p={p}, q={q}")

# --- 2. Recover m modulo q ---
# We can't do mod phi, but we CAN do mod (q-1) because gcd(5, q-1) == 1
# This recovers the message 'partially' (modulo q)
try:
    d_q = pow(e, -1, q - 1)
except ValueError:
    print("Error: q-1 is also divisible by 5? This shouldn't happen based on the digits.")
    sys.exit()

# Recover the part of m that fits in q
m_mod_q = pow(c_rsa, d_q, q)

# --- 3. Brute Force the difference ---
# We know m = m_mod_q + (k * q)
# Since p is small (169661), we can just check every possible k.
print("Brute forcing the remaining factor...")

final_key_int = None
for k in range(p):
    candidate = m_mod_q + (k * q)
    # Check if this candidate encrypts back to the original ciphertext
    if pow(candidate, e, alice_n) == c_rsa:
        final_key_int = candidate
        print(f"Found correct Key integer at k={k}")
        break

if final_key_int is None:
    print("Failed to find the key. Challenge logic might be different.")
    sys.exit()

# --- 4. Decrypt the Flag ---
# Convert key to bytes
key_bytes = final_key_int.to_bytes((final_key_int.bit_length() + 7) // 8, 'big')
print(f"Key Bytes: {key_bytes}")

# XOR Decrypt
decoded = bytearray()
for i in range(len(ciphertext_blob)):
    decoded.append(ciphertext_blob[i] ^ key_bytes[i % len(key_bytes)])

print(f"\n---------------------------------------------")
print(f"FLAG: {decoded.decode('utf-8', errors='ignore')}")
print(f"---------------------------------------------")