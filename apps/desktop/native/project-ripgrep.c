// Pin a validated Project directory before executing the bundled ripgrep. A path swapped for a symlink or a
// different directory between JavaScript validation and spawn must not redirect Quick Open / Search.
#include <errno.h>
#include <fcntl.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc < 5 || argv[1][0] != '/' || argv[4][0] != '/') return 64;
  int directory = open(argv[1], O_RDONLY | O_DIRECTORY | O_NOFOLLOW_ANY | O_CLOEXEC);
  if (directory == -1) return 126;
  struct stat identity;
  if (fstat(directory, &identity) != 0) return 126;
  if ((unsigned long long)identity.st_dev != strtoull(argv[2], NULL, 10) ||
      (unsigned long long)identity.st_ino != strtoull(argv[3], NULL, 10)) return 126;
  if (fchdir(directory) != 0) return 126;
  close(directory);
  execv(argv[4], &argv[4]);
  return 127;
}
