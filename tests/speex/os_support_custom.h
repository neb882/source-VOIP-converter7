/* Speex's hook for its C library wrappers (OS_SUPPORT_CUSTOM in
 * libspeex/os_support.h). The WebAssembly build has no stdio: a failed
 * internal assertion traps instead of printing and exiting, and the in-band
 * text message handler, which nothing here installs, prints nothing. */
#define OVERRIDE_SPEEX_FATAL
static inline void _speex_fatal(const char *str, const char *file, int line) {
  (void)str; (void)file; (void)line;
  __builtin_trap();
}
#define OVERRIDE_SPEEX_PUTC
static inline void _speex_putc(int ch, void *file) { (void)ch; (void)file; }
