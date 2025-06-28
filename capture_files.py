import os
import glob

def write_file_content(output_file, file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            output_file.write(f"File Name: {os.path.basename(file_path)}\n")
            output_file.write(f"File Path: {file_path}\n")
            output_file.write("File Contents:\n")
            output_file.write(content)
            output_file.write("\n---\n\n")
    except Exception as e:
        print(f"Error processing {file_path}: {str(e)}")

def main():
    # List of files to capture
    files_to_capture = [
        'src/agents/EntityScout.js',
        'src/agents/GraphBuilder.js',
        'src/agents/RelationshipResolver.js',
        'src/agents/SelfCleaningAgent.js',
        'src/utils/cacheClient.js',
        'src/utils/deepseekClient.js',
        'src/utils/jsonSchemaValidator.js',
        'src/utils/LLMResponseSanitizer.js',
        'src/utils/logger.js',
        'src/utils/neo4jDriver.js',
        'src/utils/pipelineApi.js',
        'src/utils/queueManager.js',
        'src/utils/schema.sql',
        'src/utils/sqliteDb.js'
    ]

    # Add all files from services directory
    services_files = glob.glob('src/services/**/*.js', recursive=True)
    files_to_capture.extend(services_files)

    # Add worker files
    worker_files = [
        'src/workers/directoryAggregationWorker.js',
        'src/workers/directoryResolutionWorker.js',
        'src/workers/fileAnalysisWorker.js',
        'src/workers/globalResolutionWorker.js',
        'src/workers/ReconciliationWorker.js',
        'src/workers/relationshipResolutionWorker.js',
        'src/workers/ValidationWorker.js'
    ]
    files_to_capture.extend(worker_files)

    # Add config and main files
    files_to_capture.extend([
        'src/config.js',
        'src/main.js'
    ])

    # Create output file
    output_path = 'code_capture.txt'
    with open(output_path, 'w', encoding='utf-8') as output_file:
        for file_path in files_to_capture:
            if os.path.exists(file_path):
                print(f"Processing: {file_path}")
                write_file_content(output_file, file_path)
            else:
                print(f"Warning: File not found - {file_path}")

    print(f"\nCapture complete! Output saved to: {output_path}")

if __name__ == "__main__":
    main() 