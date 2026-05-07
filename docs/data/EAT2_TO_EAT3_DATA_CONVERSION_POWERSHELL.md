# EAT2 -> EAT3 data conversion v5

This version is based on verified GitHub raw structure.

The source data files are row arrays, not columnar objects. The converter is defensive and can identify columnar objects, but expected shape is `row_array`.
