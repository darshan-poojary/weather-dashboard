import subprocess
import os

print("Committing updated weather files...")

subprocess.run([
    "git",
    "config",
    "--global",
    "user.email",
    "railway@weather.com"
])

subprocess.run([
    "git",
    "config",
    "--global",
    "user.name",
    "Railway Weather Bot"
])

subprocess.run([
    "git",
    "add",
    "public/cloud-grid.json",
    "public/thunderstorm-cells.json"
])

subprocess.run([
    "git",
    "commit",
    "-m",
    "Automatic weather update"
])

token = os.environ["GITHUB_TOKEN"]
user = os.environ["GITHUB_USERNAME"]

repo_url = (
    f"https://{user}:{token}"
    "@github.com/"
    f"{user}/weather-dashboard.git"
)

subprocess.run([
    "git",
    "push",
    repo_url,
    "main"
])

print("GitHub updated")