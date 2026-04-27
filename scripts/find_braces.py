import sys

file_path = sys.argv[1]
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

balance = 0
for i, line in enumerate(lines):
    # Rough check for braces outside of common template literal patterns
    # (Simplified for shell script use)
    opens = line.count('{')
    closes = line.count('}')
    balance += opens
    balance -= closes
    if balance < 0:
        print(f"L{i+1}: {balance} | {line.strip()}")
        balance = 0 # reset to find next error

print(f"Final: {balance}")
