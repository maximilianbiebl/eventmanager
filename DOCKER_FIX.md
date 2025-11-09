# Fix for Docker IPv6 Connectivity Issue

## Problem
Docker is trying to connect to Docker Hub using IPv6, but your system doesn't have IPv6 connectivity, resulting in:
```
dial tcp [2600:1f18:2148:bc01:d264:1314:1d00:2edd]:443: connect: network is unreachable
```

## Solution Options

### Option 1: Configure Docker Daemon (Recommended)

1. **Copy the daemon.json file:**
   ```bash
   sudo cp daemon.json /etc/docker/daemon.json
   ```

2. **Restart Docker daemon:**

   **On Linux:**
   ```bash
   sudo systemctl restart docker
   ```

   **On macOS/Windows (Docker Desktop):**
   - Right-click Docker Desktop icon → Restart
   - Or: Docker Desktop → Settings → Apply & Restart

3. **Verify the configuration:**
   ```bash
   docker info | grep -i ipv6
   ```

### Option 2: Docker Desktop GUI Configuration

If you're using Docker Desktop:

1. Open Docker Desktop
2. Go to Settings → Docker Engine
3. Add the following to the JSON configuration:
   ```json
   {
     "ipv6": false,
     "ip6tables": false
   }
   ```
4. Click "Apply & Restart"

### Option 3: Environment Variable (Temporary Fix)

Set this before running docker-compose:
```bash
export DOCKER_BUILDKIT=1
export DOCKER_CLI_HINTS=false
```

Then try building again:
```bash
docker-compose build
```

### Option 4: Use IPv4 DNS Resolver

Edit `/etc/docker/daemon.json` and add:
```json
{
  "ipv6": false,
  "dns": ["8.8.8.8", "8.8.4.4"]
}
```

## Verify the Fix

After applying any solution, test with:
```bash
docker-compose build frontend
```

## Additional Notes

- The `daemon.json` file in this directory is a template - copy it to `/etc/docker/daemon.json`
- After changing daemon configuration, always restart Docker
- If you're behind a proxy, you may need additional configuration

## Troubleshooting

If the issue persists:

1. **Check IPv6 is actually disabled:**
   ```bash
   docker network inspect bridge | grep IPv6
   ```
   Should show: `"EnableIPv6": false`

2. **Clear Docker's DNS cache:**
   ```bash
   docker system prune -a
   ```

3. **Check system IPv6:**
   ```bash
   ip -6 addr show
   ```

4. **Try pulling an image directly:**
   ```bash
   docker pull nginx:alpine
   ```

For more help, see: https://docs.docker.com/config/daemon/
