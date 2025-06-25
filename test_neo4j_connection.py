import os
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

uri = os.getenv("NEO4J_URI")
user = os.getenv("NEO4J_USER")
password = os.getenv("NEO4J_PASSWORD")
database = os.getenv("NEO4J_DATABASE")

print("Environment variables:")
print(f"NEO4J_URI: {uri}")
print(f"NEO4J_USER: {user}")
print(f"NEO4J_PASSWORD: {'***' if password else 'undefined'}")
print(f"NEO4J_DATABASE: {database}")

try:
    driver = GraphDatabase.driver(uri, auth=(user, password))
    with driver.session(database=database) as session:
        print("\nTesting driver connectivity...")
        session.run("RETURN 1")
        print("✓ Connection successful")
except Exception as e:
    print(f"\n✗ Connection failed: {e}")
finally:
    if 'driver' in locals() and driver:
        driver.close()