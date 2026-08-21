"""
run.py  –  One-click launcher for Smart Vision AI Assistant
Run from the project root:  python run.py
"""

import subprocess, sys, os

ROOT    = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, 'backend')

def main():
    print("\n" + "="*60)
    print("  🚀  Smart Vision AI Assistant")
    print("="*60)
    print(f"  Launching Flask on http://localhost:5000")
    print(f"  Open your browser and navigate to the URL above.")
    print("="*60 + "\n")

    os.chdir(BACKEND)
    subprocess.run([sys.executable, 'app.py'])

if __name__ == '__main__':
    main()