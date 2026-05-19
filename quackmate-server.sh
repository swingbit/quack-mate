#!/bin/bash

# quackmate-server.sh
# Unified launcher for the Quackmate development servers.

HTTP_PORT=${HTTP_PORT:-8000}
API_PORT=${API_PORT:-3001}
MODE=""

show_usage() {
    echo "Usage: ./quackmate-server.sh {node | static} [-h | --http-port <http-port>] [-a | --api-http-port <http-port>]"
    echo ""
    echo "Modes:"
    echo "  node    Runs the unified Node.js dev server (Express API + static server)"
    echo "  static  Runs a simple python3 static HTTP server only (WASM client-only)"
}

# Parse command line options
while [[ ${#} -gt 0 ]]; do
    case "${1}" in
        -h|--http-port)
            HTTP_PORT="${2}"
            shift 2
            ;;
        -a|--api-http-port)
            API_PORT="${2}"
            shift 2
            ;;
        node|static)
            MODE="${1}"
            shift
            ;;
        *)
            echo "Unknown option: ${1}"
            show_usage
            exit 1
            ;;
    esac
done

if [ -z "${MODE}" ]; then
    show_usage
    exit 1
fi

if [ "${MODE}" = "static" ]; then
    echo "=============================================="
    echo "   Starting Quackmate Static HTTP Server      "
    echo "   Serving: http://localhost:${HTTP_PORT}            "
    echo "=============================================="
    python3 -m http.server "${HTTP_PORT}"
elif [ "${MODE}" = "node" ]; then
    echo "=============================================="
    echo "   Starting Quackmate Unified Dev Server      "
    echo "   API Server   : http://localhost:${API_PORT}  "
    echo "   HTTP Server  : http://localhost:${HTTP_PORT}      "
    echo "=============================================="
    HTTP_PORT="${HTTP_PORT}" API_PORT="${API_PORT}" node utils/server.js
fi
