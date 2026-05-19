import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import re
import os

def parse_threads_benchmark(filepaths):
    all_data = []
    # Regex to capture the time value from the '+ LMR' row in the Markdown table
    # Matches the 5th column: | Config | Move | Score | Nodes | Time (ms) | ...
    row_pattern = re.compile(r"\|\s*\+\s*LMR\s*\|.*?\|.*?\|.*?\|\s*(\d+)\s*\|")
    
    for path in filepaths:
        if not os.path.exists(path):
            print(f"Warning: {path} not found.")
            continue
            
        # Extract thread count from filename (e.g., benchmark.results.threads_4.md -> 4)
        thread_match = re.search(r"threads_(\d+)", path)
        threads = int(thread_match.group(1)) if thread_match else 0
        
        with open(path, 'r') as f:
            content = f.read()
        
        # Split content by board headers to isolate each test case
        sections = content.split("### Board:")
        for section in sections[1:]:
            # Extract board name from the section header
            board_name = section.split(":")[0].strip()
            
            # Find the '+ LMR' benchmark result
            match = row_pattern.search(section)
            if match:
                time_ms = int(match.group(1))
                all_data.append({
                    "Threads": threads,
                    "Board": board_name,
                    "Time (ms)": time_ms
                })
            
    return pd.DataFrame(all_data)

# List of files to process
script_dir = os.path.dirname(os.path.abspath(__file__))
files = [
    os.path.join(script_dir, 'benchmark.results.threads_1.md'),
    os.path.join(script_dir, 'benchmark.results.threads_2.md'),
    os.path.join(script_dir, 'benchmark.results.threads_3.md'),
    os.path.join(script_dir, 'benchmark.results.threads_4.md'),
    os.path.join(script_dir, 'benchmark.results.threads_6.md'),
    os.path.join(script_dir, 'benchmark.results.threads_8.md'),
    os.path.join(script_dir, 'benchmark.results.threads_16.md')
]

# Process data and generate the visualization
df = parse_threads_benchmark(files)

plt.figure(figsize=(10, 6))
sns.set_theme(style="whitegrid")
sns.lineplot(data=df, x="Threads", y="Time (ms)", hue="Board", marker="o", linewidth=2)

plt.title("Search Time Scaling by Thread Count (Max Depth 5)")
plt.xlabel("Number of Threads")
plt.ylabel("Execution Time (ms)")
plt.xticks([1, 2, 3, 4, 6, 8, 16])
plt.grid(True, which="both", ls="--", alpha=0.5)
plt.show()