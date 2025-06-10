#!/bin/sh 

set -e

touch drawer.db
sqlx migrate run --database-url=sqlite://drawer.db