# Push to Main Branch - Documentation

This repository provides multiple ways to create and push a main branch.

## Methods

### 1. Interactive Script (Original)
Use the original interactive script for manual, guided operation:

```bash
./push-to-main.sh
```

This script will:
- Ask for confirmation at each step
- Allow you to commit changes
- Create or update the main branch
- Optionally delete the source branch

**Requirements:** zsh shell

### 2. Automated Script (Non-Interactive)
Use the automated script for CI/CD or scripted workflows:

```bash
# Basic usage
./push-to-main-auto.sh

# With custom commit message
./push-to-main-auto.sh --commit-message "Update site with new features"

# Delete source branch after push
./push-to-main-auto.sh --delete-source-branch

# Combined
./push-to-main-auto.sh --commit-message "Release v1.0" --delete-source-branch
```

**Requirements:** bash shell (more portable than zsh)

### 3. GitHub Actions Workflow
Use GitHub Actions for completely automated, web-based operation:

1. Go to your repository on GitHub
2. Click on "Actions" tab
3. Find "Push to Main Branch" workflow
4. Click "Run workflow"
5. Optionally specify:
   - Source branch (defaults to current branch)
   - Whether to delete source branch after push

This method requires no local terminal access and can be triggered from the GitHub web interface.

## When to Use Each Method

- **Interactive Script**: When you want full control and confirmation at each step (local development)
- **Automated Script**: When integrating into CI/CD pipelines or automation scripts
- **GitHub Actions**: When you want to push to main from the web interface or from other workflows

## Notes

- After creating the main branch, remember to set it as the default branch in GitHub:
  - Go to Settings → Branches
  - Change default branch to `main`
- The automated methods will commit any uncommitted changes automatically
- The main branch will be created from your current branch state
