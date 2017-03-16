#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

NETWORK_NAME='pg_search_sequelize_test'
DB_CONTAINER='pg-search-sequelize-test-db'
NODE_CONTAINER='pg-search-sequelize-test-node'

network_id=$(docker network ls --filter name="$NETWORK_NAME" -q)
db_container_id=$(docker ps -a --filter name="$DB_CONTAINER" -q)
node_container_id=$(docker ps -a --filter name="$NODE_CONTAINER" -q)

if [[ ! -z ${db_container_id} ]]; then
  docker rm -f "$DB_CONTAINER"
fi

if [[ ! -z ${node_container_id} ]]; then
  docker rm -f "$NODE_CONTAINER"
fi

if [[ ! -z ${network_id} ]]; then
  docker network rm "$NETWORK_NAME"
fi

