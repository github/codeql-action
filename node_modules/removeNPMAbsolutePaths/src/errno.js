'use strict';

const all = [
  {
    errno: -2,
    code: 'ENOENT',
    description: 'No such file or directory',
  },
  {
    errno: -1,
    code: 'UNKNOWN',
    description: 'Unknown error',
  },
  {
    errno: 0,
    code: 'OK',
    description: 'Success',
  },
  {
    errno: 1,
    code: 'EOF',
    description: 'End of file',
  },
  {
    errno: 2,
    code: 'EADDRINFO',
    description: 'Getaddrinfo error',
  },
  {
    errno: 3,
    code: 'EACCES',
    description: 'Permission denied',
  },
  {
    errno: 4,
    code: 'EAGAIN',
    description: 'Resource temporarily unavailable',
  },
  {
    errno: 5,
    code: 'EADDRINUSE',
    description: 'Address already in use',
  },
  {
    errno: 6,
    code: 'EADDRNOTAVAIL',
    description: 'Address not available',
  },
  {
    errno: 7,
    code: 'EAFNOSUPPORT',
    description: 'Address family not supported',
  },
  {
    errno: 8,
    code: 'EALREADY',
    description: 'Connection already in progress',
  },
  {
    errno: 9,
    code: 'EBADF',
    description: 'Bad file descriptor',
  },
  {
    errno: 10,
    code: 'EBUSY',
    description: 'Resource busy or locked',
  },
  {
    errno: 11,
    code: 'ECONNABORTED',
    description: 'Software caused connection abort',
  },
  {
    errno: 12,
    code: 'ECONNREFUSED',
    description: 'Connection refused',
  },
  {
    errno: 13,
    code: 'ECONNRESET',
    description: 'Connection reset by peer',
  },
  {
    errno: 14,
    code: 'EDESTADDRREQ',
    description: 'Destination address required',
  },
  {
    errno: 15,
    code: 'EFAULT',
    description: 'Bad address in system call argument',
  },
  {
    errno: 16,
    code: 'EHOSTUNREACH',
    description: 'Host is unreachable',
  },
  {
    errno: 17,
    code: 'EINTR',
    description: 'Interrupted system call',
  },
  {
    errno: 18,
    code: 'EINVAL',
    description: 'Invalid argument',
  },
  {
    errno: 19,
    code: 'EISCONN',
    description: 'Socket is already connected',
  },
  {
    errno: 20,
    code: 'EMFILE',
    description: 'Too many open files',
  },
  {
    errno: 21,
    code: 'EMSGSIZE',
    description: 'Message too long',
  },
  {
    errno: 22,
    code: 'ENETDOWN',
    description: 'Network is down',
  },
  {
    errno: 23,
    code: 'ENETUNREACH',
    description: 'Network is unreachable',
  },
  {
    errno: 24,
    code: 'ENFILE',
    description: 'File table overflow',
  },
  {
    errno: 25,
    code: 'ENOBUFS',
    description: 'No buffer space available',
  },
  {
    errno: 26,
    code: 'ENOMEM',
    description: 'Not enough memory',
  },
  {
    errno: 27,
    code: 'ENOTDIR',
    description: 'Not a directory',
  },
  {
    errno: 28,
    code: 'EISDIR',
    description: 'Illegal operation on a directory',
  },
  {
    errno: 29,
    code: 'ENONET',
    description: 'Machine is not on the network',
  },
  {
    errno: 31,
    code: 'ENOTCONN',
    description: 'Socket is not connected',
  },
  {
    errno: 32,
    code: 'ENOTSOCK',
    description: 'Socket operation on non-socket',
  },
  {
    errno: 33,
    code: 'ENOTSUP',
    description: 'Operation not supported on socket',
  },
  {
    errno: 34,
    code: 'ENOENT',
    description: 'No such file or directory',
  },
  {
    errno: 35,
    code: 'ENOSYS',
    description: 'Function not implemented',
  },
  {
    errno: 36,
    code: 'EPIPE',
    description: 'Broken pipe',
  },
  {
    errno: 37,
    code: 'EPROTO',
    description: 'Protocol error',
  },
  {
    errno: 38,
    code: 'EPROTONOSUPPORT',
    description: 'Protocol not supported',
  },
  {
    errno: 39,
    code: 'EPROTOTYPE',
    description: 'Protocol wrong type for socket',
  },
  {
    errno: 40,
    code: 'ETIMEDOUT',
    description: 'Connection timed out',
  },
  {
    errno: 41,
    code: 'ECHARSET',
    description: 'Invalid Unicode character',
  },
  {
    errno: 42,
    code: 'EAIFAMNOSUPPORT',
    description: 'Address family for hostname not supported',
  },
  {
    errno: 44,
    code: 'EAISERVICE',
    description: 'Servname not supported for ai_socktype',
  },
  {
    errno: 45,
    code: 'EAISOCKTYPE',
    description: 'Ai_socktype not supported',
  },
  {
    errno: 46,
    code: 'ESHUTDOWN',
    description: 'Cannot send after transport endpoint shutdown',
  },
  {
    errno: 47,
    code: 'EEXIST',
    description: 'File already exists',
  },
  {
    errno: 48,
    code: 'ESRCH',
    description: 'No such process',
  },
  {
    errno: 49,
    code: 'ENAMETOOLONG',
    description: 'Name too long',
  },
  {
    errno: 50,
    code: 'EPERM',
    description: 'Operation not permitted',
  },
  {
    errno: 51,
    code: 'ELOOP',
    description: 'Too many symbolic links encountered',
  },
  {
    errno: 52,
    code: 'EXDEV',
    description: 'Cross-device link not permitted',
  },
  {
    errno: 53,
    code: 'ENOTEMPTY',
    description: 'Directory not empty',
  },
  {
    errno: 54,
    code: 'ENOSPC',
    description: 'No space left on device',
  },
  {
    errno: 55,
    code: 'EIO',
    description: 'I/O error',
  },
  {
    errno: 56,
    code: 'EROFS',
    description: 'Read-only file system',
  },
  {
    errno: 57,
    code: 'ENODEV',
    description: 'No such device',
  },
  {
    errno: 58,
    code: 'ESPIPE',
    description: 'Invalid seek',
  },
  {
    errno: 59,
    code: 'ECANCELED',
    description: 'Operation canceled',
  },
];

module.exports = {};

all.forEach((error) => {
  module.exports[error.errno] = error.description;
});
