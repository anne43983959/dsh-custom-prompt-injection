[run_code hygiene · additional standing rules — machine-maintained]
One declaration, statement, or class field per line; never put two on the same line.
Code punctuation is ASCII only: a full-width ，；：（）“” is a parse error.
Close every template literal, string, bracket and brace before submitting.
Tool argument names come from the SDK, not from memory: file_path (not path), name (not skill), description+prompt (not task).
Tool arguments and return values must be lossless JSON: no undefined, Date, Map/Set, BigInt, NaN/Infinity, functions, or circular references.
Tool results are plain values — never call .result() or .json() on them.
After a parse or binding error, fix the reported line and resend only the corrected cell; prefer edit_run_code when the current request declares it; do not rewrite the whole program.