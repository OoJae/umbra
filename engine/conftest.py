"""Its existence puts engine/ on sys.path so `import app` works under pytest's default
prepend import mode. Do not add engine/tests/__init__.py — that changes the basedir."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
