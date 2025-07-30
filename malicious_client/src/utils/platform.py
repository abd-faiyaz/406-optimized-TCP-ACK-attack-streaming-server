import sys

def is_browser() -> bool:
    # There is no browser environment for Python scripts
    # You could implement this for Pyodide or Brython, but usually:
    return False

def is_node() -> bool:
    # Equivalent in Python: running in CPython (the default)
    # But if you just want to check for mainline Python interpreter:
    return sys.platform != "emscripten" and sys.platform != "wasi"  # Not in browser/Pyodide

# If you want to check if running interactively (like Jupyter), you could add:
def is_interactive() -> bool:
    import __main__ as main
    return not hasattr(main, '__file__')
