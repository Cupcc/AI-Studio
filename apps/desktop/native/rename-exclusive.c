// macOS Files mutations: never replace a destination created by another process between validation and rename.
// Arguments are already validated absolute paths from the main process. Open both parent directories without
// following symlinks and use descriptor-relative renameatx_np(RENAME_EXCL). No shell or copying fallback.
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc != 3) return EINVAL;
  if (argv[1][0] != '/' || argv[2][0] != '/') return EINVAL;
  char *from_dir = strdup(argv[1]), *to_dir = strdup(argv[2]);
  if (!from_dir || !to_dir) return ENOMEM;
  char *from_name = strrchr(from_dir, '/'), *to_name = strrchr(to_dir, '/');
  *from_name++ = '\0'; *to_name++ = '\0';
  if (!*from_name || !*to_name) return EINVAL;
  int from = open(*from_dir ? from_dir : "/", O_RDONLY | O_DIRECTORY | O_NOFOLLOW_ANY | O_CLOEXEC);
  if (from == -1) return errno;
  int to = open(*to_dir ? to_dir : "/", O_RDONLY | O_DIRECTORY | O_NOFOLLOW_ANY | O_CLOEXEC);
  if (to == -1) { int error = errno; close(from); return error; }
  int error = renameatx_np(from, from_name, to, to_name, RENAME_EXCL) == 0 ? 0 : errno;
  close(from); close(to);
  free(from_dir); free(to_dir);
  return error;
}
