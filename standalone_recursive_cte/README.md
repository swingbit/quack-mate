# Standalone Recursive CTE Chess Engine

This directory contains a fully standalone, minimal, and self-contained implementation of the **Quack-Mate** chess search engine using a recursive Common Table Expression (CTE) in DuckDB.

## Structure
- `prepare_standalone.js`: Creates `schema.sql` and `query.sql` from the main project.
- `schema.sql`: Minimal database schema with tables for board state, static evaluations (PST), precomputed attack/mobility masks, and Zobrist hashing. Contains all precomputed data.
- `query.sql`: A single unified recursive CTE query file that performs recursive move generation and minimax backpropagation dynamically for any side to move (default depth: 3).
- `run.js`: A Node.js runner script that sets up the database, loads chess positions, and runs search queries.

## Requirements
- **DuckDB 1.5.0 or greater** is required because the recursive minimax evaluation CTE uses the recursive `recurring` syntax introduced in DuckDB 1.5.

## How to Run

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run the example positions runner**:
   ```bash
   node run.js
   ```

3. **Re-generating/updating SQL files**:
   If you make changes to the parent project's database tables or parameters, you can re-generate the SQL query and schema files by running:
   ```bash
   node prepare_standalone.js
   ```

## Customizing the Depth
To run the search at a different depth (default 3, increase at your own risk):
- Open `query.sql` and change the recursion limit `s_in.depth < 3` to the desired depth (e.g., `s_in.depth < 4`).
- Change the leaf condition `s.depth = 3` and `3 - (prev.step + 1)` in the minimax backpropagation CTE to match the new depth.
