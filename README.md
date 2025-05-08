# Foundry Local
> A web application for running local SLMs (small language models) using Neutron Server and Foundry Client with local vector search capabilities.

<!-- Javascript -->
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
![GitHub issues](https://img.shields.io/github/issues/sealjay/dating-rulebook)
![GitHub](https://img.shields.io/github/license/sealjay/dating-rulebook)
![GitHub Repo stars](https://img.shields.io/github/stars/sealjay/dating-rulebook?style=social)
[![TypeScript](https://img.shields.io/badge/--3178C6?logo=typescript&logoColor=ffffff)](https://www.typescriptlang.org/)
[![Azure](https://img.shields.io/badge/--3178C6?logo=microsoftazure&logoColor=ffffff)](https://learn.microsoft.com/en-us/azure/developer/azure-developer-cli/?WT.mc_id=AI-MVP-5004204)
[![React](https://img.shields.io/badge/--3178C6?logo=react&logoColor=ffffff)](https://reactjs.org/)

## About the App

Foundry Local provides a seamless interface for local LLM inference. It combines:
- **Neutron Server** (Inference.Service.Agent) for model processing
- **Foundry Client** for handling requests
- **Local vector search** using sqlite-vec and transformers.js for embeddings
- A **Next.js frontend** for a user-friendly interaction experience

With Foundry Local, you can run powerful language models directly on your machine without requiring cloud services, providing privacy, lower latency, and no usage costs.

## Knowledge Features

The application includes a RAG (Retrieval-Augmented Generation) system that:
- Automatically indexes CSV files placed in the `/data` folder
- Generates embeddings locally using transformers.js (no OpenAI API needed)
- Stores vectors efficiently in SQLite using sqlite-vec extension
- Only re-indexes files that have been added or changed
- Falls back to text search if embedding generation fails

## Configuration

The application uses an `.env` file for configuration. You can modify the following settings:

```properties
# Default model configuration
FOUNDRY_LOCAL_MODEL=deepseek-r1-distill-qwen-7b-cpu-int4-rtn-block-32-acc-level-4
```

You can update this file to change the model used for inference.

### Configuring Path Settings for macOS

When running on macOS, you'll need to modify the paths in the shell scripts to point to your installation location:

1. Edit `sh/inference.sh` to point to your Inference.Service.Agent executable:
   ```bash
   # Replace this path with the location of your Inference.Service.Agent executable
   /path/to/your/Neutron.Server/release_osx-arm64/Inference.Service.Agent
   ```

2. Edit `sh/foundry.sh` to point to your foundry executable:
   ```bash
   # Replace this path with the location of your foundry executable
   /path/to/your/Foundry.Local.Client/release_osx-arm64/foundry "$@"
   ```

These paths are currently configured with example paths. You must update them to match where you downloaded and extracted the executables on your system.

## Running the Components

This application requires three components to be running:

1. **Neutron Server (Inference.Service.Agent)**
2. **Foundry Client (foundry)**
3. **Next.js Development Server**

You need to run these in separate terminals.

### Running Neutron Server on macOS

```bash
# Make the script executable
chmod +x sh/inference.sh

# Run the server
sh/inference.sh
```

### Running Foundry Client on macOS

```bash
# Make the script executable
chmod +x sh/foundry.sh

# Run the client
sh/foundry.sh
```

You can optionally add the foundry client to your PATH for easier access.

### Running the Web Interface

```bash
# Install dependencies (first time only)
npm install

# Run the development server
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) with your browser to see the interface.

### Notes for macOS Users

- You'll likely have to approve a bunch of executables that won't go through on the first try
- You may need to dive into security settings and press approve multiple times before you get your first token
- Performance should be good, especially on ARM hardware, though the macOS version may be more prone to bugs than the Windows version

## Remove macOS Quarantine Attributes

If you're having issues with macOS security features blocking the executables, you may need to remove the quarantine attribute:

```bash
# Make scripts executable
chmod +x sh/macsetup.sh
chmod +x sh/foundry.sh
chmod +x sh/inference.sh

# Make downloaded executables executable
chmod +x /Users/chris.lloyd-jones/Downloads/drop_build_osx/Neutron.Server/release_osx-arm64/Inference.Service.Agent
chmod +x /Users/chris.lloyd-jones/Downloads/drop_build_osx/Foundry.Local.Client/release_osx-arm64/foundry

# Remove quarantine attributes
xattr -d com.apple.quarantine /Users/chris.lloyd-jones/Downloads/drop_build_osx/Neutron.Server/release_osx-arm64/Inference.Service.Agent
xattr -d com.apple.quarantine /Users/chris.lloyd-jones/Downloads/drop_build_osx/Foundry.Local.Client/release_osx-arm64/foundry
```