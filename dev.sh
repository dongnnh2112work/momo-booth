#!/bin/sh
cd "$(dirname "$0")"
if [ -x ".toolchain/node/bin/node" ]; then
  PATH="$(pwd)/.toolchain/node/bin:$PATH"
  export PATH
fi
exec npm run dev
