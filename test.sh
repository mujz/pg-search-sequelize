#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

NODE_IMAGE='mujz/pg-search-sequelize-example'
NETWORK_NAME='pg_search_sequelize_test'
DB_CONTAINER='pg-search-sequelize-test-db'
NODE_CONTAINER='pg-search-sequelize-test-node'

network_id=$(docker network ls --filter name="$NETWORK_NAME" -q)
db_container_id=$(docker ps -a --filter name="$DB_CONTAINER" -q)
node_container_id=$(docker ps -a --filter name="$NODE_CONTAINER" -q)

# Create network if it doesn't exist
if [[ -z ${network_id} ]]; then
  docker network create "$NETWORK_NAME"
fi

# start db container if it exists, otherwise, create it.
if [[ -z ${db_container_id} ]]; then
  docker run --name "$DB_CONTAINER" --network "$NETWORK_NAME" -d mujz/movies-pg
  echo 'waiting for db to finish initialization'
  getStatus=""
  status=1
  while [ "$status" -ne 0 ]; do
    sleep 1
    status=$(docker logs "$DB_CONTAINER" --tail=6 | grep "PostgreSQL init process complete"; echo $?)
  done
else
  docker start "$DB_CONTAINER"
fi

# start node container if it exists, otherwise, create it.
if [[ -z ${node_container_id} ]]; then
  docker run --name "$NODE_CONTAINER" --network "$NETWORK_NAME" -it -v $(pwd):/app -w /app node npm test
else
  docker start "$NODE_CONTAINER"
  docker attach "$NODE_CONTAINER"
fi
