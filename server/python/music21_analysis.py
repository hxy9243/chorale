"""Trusted sandbox entry point. The snippet receives only constructed score data."""
import contextlib
import ctypes
from fractions import Fraction
import io
import json
import resource
import re
import sys

resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
resource.setrlimit(resource.RLIMIT_NPROC, (0, 0))
resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
for path in json.loads(sys.argv[1]):
    if path not in sys.path:
        sys.path.append(path)

import music21


class SandboxUnavailable(Exception):
    pass


def lock_syscalls():
    """No child processes, nested namespaces, mounts, sockets or kernel APIs."""
    try:
        library = ctypes.CDLL('libseccomp.so.2')
        library.seccomp_init.argtypes = [ctypes.c_uint32]
        library.seccomp_init.restype = ctypes.c_void_p
        library.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
        library.seccomp_syscall_resolve_name.restype = ctypes.c_int
        library.seccomp_rule_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]
        library.seccomp_load.argtypes = [ctypes.c_void_p]
        library.seccomp_release.argtypes = [ctypes.c_void_p]
        policy = library.seccomp_init(0x7fff0000)  # SCMP_ACT_ALLOW
        if not policy:
            raise RuntimeError('Cannot create syscall policy')
        try:
            denied = ('clone clone3 fork vfork unshare setns mount umount2 pivot_root chroot '
                      'fsopen fsconfig fsmount move_mount open_tree mount_setattr execve execveat '
                      'ptrace process_vm_readv process_vm_writev bpf userfaultfd io_uring_setup '
                      'init_module finit_module kexec_load reboot swapon swapoff perf_event_open '
                      'keyctl add_key request_key socket socketpair syslog')
            for name in denied.split():
                number = library.seccomp_syscall_resolve_name(name.encode())
                if number >= 0 and library.seccomp_rule_add(policy, 0x50001, number, 0) != 0:
                    raise RuntimeError('Cannot deny syscall')
            if library.seccomp_load(policy) != 0:
                raise RuntimeError('Cannot enable syscall policy')
        finally:
            library.seccomp_release(policy)
    except Exception as error:
        raise SandboxUnavailable('The Python syscall sandbox could not be enabled') from error


class BoundedOutput(io.StringIO):
    def write(self, text):
        if self.tell() + len(text) > 32768:
            raise ValueError('Printed output exceeds 32 KiB')
        return super().write(text)


def analyze(payload):
    score = music21.stream.Score()
    for voice_id in dict.fromkeys(event['voiceId'] for event in payload['events']):
        part = music21.stream.Part(id=voice_id)
        by_number = {}
        for item in payload['measures']:
            measure = music21.stream.Measure(number=item['number'])
            part.insert(Fraction(item['offsetQuarterLength']), measure)
            by_number[item['number']] = measure
        for event in payload['events']:
            if event['voiceId'] != voice_id:
                continue
            # Authoritative pitch spelling uses b; music21 uses '-' for flats.
            step, accidentals, octave = re.fullmatch(r'([A-G])([#b]*)(-?\d+)', event['pitch']).groups()
            pitch = music21.pitch.Pitch()
            pitch.step = step
            pitch.accidental = accidentals.count('#') - accidentals.count('b')
            pitch.octave = int(octave)
            note = music21.note.Note(pitch, quarterLength=Fraction(event['durationQuarterLength']))
            note.id = event['id']
            note.editorial['sourceEventIds'] = event['sourceEventIds']
            note.editorial['carryIn'] = event['carryIn']
            by_number[event['measure']].insert(Fraction(event['measureOffsetQuarterLength']), note)
        score.insert(0, part)
    namespace = {'music21': music21, 'score': score, 'events': payload['events'],
                 'measures': payload['measures']}
    captured = BoundedOutput()
    lock_syscalls()
    with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
        exec(compile(payload['code'], '<music21-analysis>', 'exec'), namespace)
    if 'result' not in namespace:
        raise ValueError('Assign a JSON-serializable value to result')
    value = {'result': namespace['result'], 'stdout': captured.getvalue()}
    encoded = json.dumps(value, allow_nan=False)
    if len(encoded.encode('utf8')) > 262144:
        raise ValueError('Analysis result exceeds 256 KiB')
    return encoded


try:
    print(analyze(json.load(sys.stdin)))
except Exception as error:
    print(json.dumps({'error': f'{type(error).__name__}: {str(error)[:1000]}',
                      'errorCode': 'MUSIC21_SANDBOX_UNAVAILABLE' if isinstance(error, SandboxUnavailable) else 'MUSIC21_CODE_FAILED'}))
