---
description: How to deploy the application to a VPS using Coolify
---

To deploy this application to your VPS via Coolify, follow these steps:

### 1. Push your code to GitHub
Coolify synchronizes with your Git repository to handle deployments automatically.

```bash
# Initialize git
git init
git add .
git commit -m "Initial commit"

# Create a repo on GitHub and follow their instructions to push:
# git remote add origin <your-repo-url>
# git branch -M main
# git push -u origin main
```

### 2. Add Resource in Coolify
1. Open your Coolify dashboard at `http://65.109.82.254:8000`.
2. Navigate to **Projects** and select your project (e.g., "My first project").
3. Click **+ Add Resource**.
4. Choose **Public Repository** (or Private if you've connected your GitHub account).
5. Paste your repository URL and click **Continue**.

### 3. Configure the Application
1. Coolify should automatically detect the `Dockerfile`.
2. In the **Ports** settings, ensure it's set to `3000:3000`.
3. Go to the **Environment Variables** tab and add the following:
   - `SMTP_USER`: `support@xpips.com`
   - `SMTP_PASS`: Your SMTP password
   - `SMTP_HOST`: `smtp.zoho.eu`
   - `SMTP_PORT`: `465`
4. Click **Deploy**.

### 4. Verify Deployment
Once the build is complete, Coolify will provide you with a URL (or you can set a custom domain) to access your bot's control panel.
