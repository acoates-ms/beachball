import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { findGitRoot } from './paths';
import url from 'url';
import gitUrlParse from 'git-url-parse';

export function git(args: string[], options?: { cwd: string }) {
  const results = spawnSync('git', args, options);

  if (results.status === 0) {
    return {
      stderr: results.stderr.toString().trim(),
      stdout: results.stdout.toString().trim(),
      success: true
    };
  } else {
    return {
      stderr: results.stderr.toString().trim(),
      stdout: results.stdout.toString().trim(),
      success: false
    };
  }
}

export function getUncommittedChanges(cwd: string) {
  try {
    const results = git(['status', '--porcelain'], { cwd });

    if (!results.success) {
      return [];
    }

    const changes = results.stdout;

    if (changes.length == 0) {
      return [];
    }

    const lines = changes.split(/\n/) || [];

    return lines.map(line => line.trim().split(/\s+/)[1]);
  } catch (e) {
    console.error('Cannot gather information about changes: ', e.message);
  }
}

export function getChanges(branch: string, cwd: string) {
  try {
    const results = git(['--no-pager', 'diff', '--name-only', branch + '...'], { cwd });

    if (!results.success) {
      return [];
    }

    let changes = results.stdout;

    let lines = changes.split(/\n/) || [];

    return lines.filter(line => line.trim() !== '').map(line => line.trim());
  } catch (e) {
    console.error('Cannot gather information about changes: ', e.message);
  }
}

export function getRecentCommitMessages(branch: string, cwd: string) {
  try {
    const results = git(['log', '--decorate', '--pretty=format:%s', branch, 'HEAD'], { cwd });

    if (!results.success) {
      return [];
    }

    let changes = results.stdout;
    let lines = changes.split(/\n/) || [];

    return lines.map(line => line.trim());
  } catch (e) {
    console.error('Cannot gather information about recent commits: ', e.message);
  }
}

export function getUserEmail(cwd: string) {
  try {
    const results = git(['config', 'user.email'], { cwd });

    if (!results.success) {
      return null;
    }

    return results.stdout;
  } catch (e) {
    console.error('Cannot gather information about user.email: ', e.message);
  }
}

export function getBranchName(cwd: string) {
  try {
    const results = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });

    if (results.success) {
      return results.stdout;
    }
  } catch (e) {
    console.error('Cannot get branch name: ', e.message);
  }

  return null;
}

export function getFullBranchRef(branch: string, cwd: string) {
  const showRefResults = git(['show-ref', '--heads', branch], { cwd });
  if (showRefResults.success) {
    return showRefResults.stdout.split(' ')[1];
  }

  return null;
}

export function getShortBranchName(fullBranchRef: string, cwd: string) {
  const showRefResults = git(['name-rev', '--name-only', fullBranchRef], { cwd });
  if (showRefResults.success) {
    return showRefResults.stdout;
  }

  return null;
}

export function getCurrentHash(cwd: string) {
  try {
    const results = git(['rev-parse', 'HEAD'], { cwd });

    if (results.success) {
      return results.stdout;
    }
  } catch (e) {
    console.error('Cannot get current git hash');
  }

  return null;
}

export function stageAndCommit(patterns: string[], message: string, cwd: string) {
  try {
    patterns.forEach(pattern => {
      git(['add', pattern], { cwd });
    });

    const commitResults = git(['commit', '-m', message], { cwd });

    if (!commitResults.success) {
      console.error('Cannot commit changes');
      console.log(commitResults.stdout);
      console.error(commitResults.stderr);
    }
  } catch (e) {
    console.error('Cannot stage and commit changes', e.message);
  }
}

export function revertLocalChanges(cwd: string) {
  const stash = `beachball_${new Date().getTime()}`;
  git(['stash', 'push', '-u', '-m', stash], { cwd });
  const results = git(['stash', 'list']);
  if (results.success) {
    const lines = results.stdout.split(/\n/);
    const foundLine = lines.find(line => line.includes(stash));

    if (foundLine) {
      const matched = foundLine.match(/^[^:]+/);
      if (matched) {
        git(['stash', 'drop', matched[0]]);
        return true;
      }
    }
  }

  return false;
}

export function getParentBranch(cwd: string) {
  const branchName = getBranchName(cwd);

  if (!branchName || branchName === 'HEAD') {
    return null;
  }

  const showBranchResult = git(['show-branch', '-a'], { cwd });

  if (showBranchResult.success) {
    const showBranchLines = showBranchResult.stdout.split(/\n/);
    const parentLine = showBranchLines.find(line => line.indexOf('*') > -1 && line.indexOf(branchName) < 0 && line.indexOf('publish_') < 0);

    if (!parentLine) {
      return null;
    }

    const matched = parentLine.match(/\[(.*)\]/);

    if (!matched) {
      return null;
    }

    return matched[1];
  }

  return null;
}

export function getRemoteBranch(branch: string, cwd: string) {
  const results = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@\{u\}`], { cwd });

  if (results.success) {
    return results.stdout.trim();
  }

  return null;
}

export function parseRemoteBranch(branch: string) {
  const firstSlashPos = branch.indexOf('/', 0);
  const remote = branch.substring(0, firstSlashPos);
  const remoteBranch = branch.substring(firstSlashPos + 1);

  return {
    remote,
    remoteBranch
  };
}

function normalizeRepoUrl(repositoryUrl: string) {
  try {
    const parsed = gitUrlParse(repositoryUrl);
    return parsed
      .toString('https')
      .replace(/\.git$/, '')
      .toLowerCase();
  } catch (e) {
    return '';
  }
}

export function getDefaultRemoteMaster(cwd: string) {
  let packageJson: any;

  try {
    packageJson = JSON.parse(fs.readFileSync(path.join(findGitRoot(cwd)!, 'package.json')).toString());
  } catch (e) {
    console.log('failed to read package.json');
    throw new Error('invalid package.json detected');
  }

  const { repository } = packageJson;

  let repositoryUrl = '';

  if (typeof repository === 'string') {
    repositoryUrl = repository;
  } else if (repository && repository.url) {
    repositoryUrl = repository.url;
  }

  const normalizedUrl = normalizeRepoUrl(repositoryUrl);
  const remotesResult = git(['remote', '-v'], { cwd });

  if (remotesResult.success) {
    const allRemotes: { [url: string]: string } = {};
    remotesResult.stdout.split('\n').forEach(line => {
      const parts = line.split(/\s+/);
      allRemotes[normalizeRepoUrl(parts[1])] = parts[0];
    });

    if (Object.keys(allRemotes).length > 0) {
      const remote = allRemotes[normalizedUrl];

      if (remote) {
        console.log(`Found a matching remote URL from package.json named "${remote}/master"`);
        return `${remote}/master`;
      }
    }
  }

  console.log(`Defaults to "origin/master"`);
  return 'origin/master';
}

export function listAllTrackedFiles(cwd: string) {
  const results = git(['ls-tree', '-r', '--name-only', '--full-tree', 'HEAD'], { cwd });

  if (results.success) {
    return results.stdout.split(/\n/);
  }

  return [];
}
