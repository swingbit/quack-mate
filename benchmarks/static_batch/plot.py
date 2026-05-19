import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import re
import os

def parse_benchmark_files(file_list):
    data = []
    # Regex to capture the table rows, ignoring the header and DFS reference
    row_re = re.compile(r"\|(?P<config>.*?)\|(?P<move>.*?)\|(?P<score>.*?)\|(?P<nodes>.*?)\|(?P<time>.*?)\|(?P<rss>.*?)\|")
    
    for filename in file_list:
        if not os.path.exists(filename):
            print(f"Warning: {filename} not found. Skipping.")
            continue
            
        # Extract batch size from filename (e.g., batch_64)
        batch_size = int(re.search(r'batch_(\d+)', filename).group(1))
        
        with open(filename, 'r') as f:
            current_board = ""
            for line in f:
                if line.startswith("### Board:"):
                    current_board = line.split(":")[1].split("(")[0].strip()
                
                match = row_re.search(line)
                if match:
                    config = match.group('config').strip()
                    # Skip headers and the DFS Reference
                    if config in ["Config", "---", "Standard (DFS Reference)"]:
                        continue
                    
                    try:
                        data.append({
                            "Batch Size": batch_size,
                            "Board": current_board,
                            "Config": config,
                            "Nodes": float(match.group('nodes').strip()) if match.group('nodes').strip() != "-" else None,
                            "Time (ms)": float(match.group('time').strip()) if match.group('time').strip() != "-" else None,
                            "RSS (MB)": float(match.group('rss').strip()) if match.group('rss').strip() != "OOM" else None
                        })
                    except ValueError:
                        continue
    return pd.DataFrame(data).dropna(subset=['Time (ms)'])

# List of files
files = [
    'benchmark.results.batch_1.md', 
    'benchmark.results.batch_2.md', 
    'benchmark.results.batch_4.md', 
    'benchmark.results.batch_8.md', 
    'benchmark.results.batch_16.md', 
    'benchmark.results.batch_32.md', 
    'benchmark.results.batch_64.md', 
    'benchmark.results.batch_128.md',   
    'benchmark.results.batch_256.md'
]

df = parse_benchmark_files(files)

# Set visual style
sns.set_theme(style="whitegrid")
fig, axes = plt.subplots(3, 1, figsize=(12, 18), layout="constrained")

# BATCH SENSITIVITY: Time vs Batch Size (Final Optimization Level only)
# Shows if larger batches actually help throughput
final_configs = df[df['Config'] == '+ LMR']
sns.lineplot(data=final_configs, x="Batch Size", y="Time (ms)", hue="Board", marker="o", ax=axes[0])
axes[0].set_title("Search Time vs. Batch Size (+ LMR Config Only)")
axes[0].set_xscale('log', base=2)
axes[0].set_yscale('log')

# BATCH SENSITIVITY: Nodes vs Batch Size (Final Optimization Level only)
# Shows if batching affects the search efficiency
sns.lineplot(data=final_configs, x="Batch Size", y="Nodes", hue="Board", marker="o", ax=axes[1])
axes[1].set_title("Search Nodes vs. Batch Size (+ LMR Config Only)")
axes[1].set_xscale('log', base=2)
axes[1].set_yscale('log')

# OPTIMIZATION WATERFALL: Node Reduction (Batch 64 as representative)
# Uses log scale to show the magnitude of pruning
batch_64 = df[df['Batch Size'] == 64]
sns.barplot(data=batch_64, x="Config", y="Nodes", hue="Board", ax=axes[2])
axes[2].set_yscale('log')
axes[2].set_title("Node Reduction by Optimization (Batch 64)")
axes[2].tick_params(axis='x', rotation=30)

# # MEMORY OVERHEAD: RSS vs Batch Size
# sns.lineplot(data=df, x="Batch Size", y="RSS (MB)", hue="Board", marker="s", ax=axes[3])
# axes[3].set_title("Memory Pressure (Peak RSS) per Batch Size")
# axes[3].set_xscale('log', base=2)

plt.show()
