#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
  if (argc >= 3 && strcmp(argv[1], "-f") == 0) {
    FILE *f = fopen(argv[2], "r");
    if (!f) {
      fprintf(stderr, "echoargv: cannot open %s\n", argv[2]);
      return 1;
    }
    char buf[4096];
    size_t n;
    while ((n = fread(buf, 1, sizeof buf, f)) > 0) {
      fwrite(buf, 1, n, stdout);
    }
    fclose(f);
    return 0;
  }

  if (argc >= 4 && strcmp(argv[1], "-w") == 0) {
    FILE *f = fopen(argv[2], "w");
    if (!f) {
      fprintf(stderr, "echoargv: cannot write %s\n", argv[2]);
      return 1;
    }
    fputs(argv[3], f);
    fclose(f);
    return 0;
  }

  for (int i = 1; i < argc; i++) {
    printf("%s\n", argv[i]);
  }

  char buf[4096];
  size_t n;
  while ((n = fread(buf, 1, sizeof buf, stdin)) > 0) {
    fwrite(buf, 1, n, stdout);
  }

  return 0;
}
