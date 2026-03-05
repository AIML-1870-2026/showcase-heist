# showcase-heist — Claude Instructions

## Commands

### Deploy
When the user says "deploy":

1. **Verify location**
   - Confirm the working directory is inside `/Users/reesestowe/Documents/showcase-heist` (or a subfolder)
   - Confirm `.git` exists at the repo root

2. **Stage and commit**
   - `git add .`
   - `git commit -m "Update: [describe what changed]"`

3. **Push**
   - `git push origin main`

4. **Report success**
   - Confirm the push succeeded
   - Remind the user of the live URL: **https://aiml-1870-2026.github.io/showcase-heist/**
