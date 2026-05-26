-- Vendoora — Postgres init script.
-- Runs once on first container start (or after volume deletion).
-- Creates the test database alongside the default vendoora_dev.
CREATE DATABASE vendoora_test;
GRANT ALL PRIVILEGES ON DATABASE vendoora_test TO vendoora;
