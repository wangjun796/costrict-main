# Embedded & Firmware Security Checklist

Apply every category to the plan. Mark: YES (addressed), NO (must fix before proceeding), N/A
(not applicable to this device). Use alongside `security-checklist.md` (which covers
application-layer concerns) — this checklist focuses on the device, firmware, and hardware layers.

## 1. Secure Boot & Firmware Integrity

- [ ] Bootloader verifies the application image signature before jumping to it
- [ ] Signature chain (root-of-trust -> bootloader -> application) is enforced at every stage
- [ ] Anti-rollback: version/counter check prevents downgrade to vulnerable firmware
- [ ] Firmware images are signed (and encrypted where confidentiality is required)
- [ ] Cryptographic algorithms are vetted libraries or hardware accelerators, never custom crypto
- [ ] Signature/verification keys are stored in secure elements, fuses, or OTP, not plain flash

## 2. OTA & Update Security

- [ ] Update payload is authenticated (signature/MAC) before install
- [ ] Update package integrity (hash) and version are validated
- [ ] Update channel is encrypted (TLS) and the server is authenticated
- [ ] Failed/corrupt updates do not brick the device (dual-bank / rollback partition)
- [ ] Update code is isolated from runtime secrets and cannot be abused to leak them

## 3. Key & Secret Storage

- [ ] No hardcoded keys, passwords, certificates, or tokens in source or firmware images
- [ ] Per-device unique keys (provisioned at manufacturing, never shared across devices)
- [ ] Keys stored in secure element / TPM / hardware crypto / write-once fuses, not plain flash
- [ ] Keys never logged, never sent to the cloud, never embedded in debug output
- [ ] Provisioning is secure and auditable (no backdoor provisioning path)

## 4. Debug & Manufacturing Interfaces

- [ ] JTAG/SWD/UART debug disabled, locked, or password-protected in production
- [ ] Bootloader fallback / recovery mode does not expose unauthenticated access
- [ ] Factory test backdoors removed or gated behind one-time provisioned credentials
- [ ] Debug output (UART logs) does not leak secrets, memory contents, or firmware hashes

## 5. Device Communication Security

- [ ] Inter-device / bus traffic (CAN, UART, SPI, I2C, radio, USB) is authenticated where it matters
- [ ] Integrity protection (MAC/signature) on safety- or security-critical messages
- [ ] Anti-replay: nonce / sequence number / timestamp on authenticated messages
- [ ] Input from bus/network is validated at the boundary (length, type, range, format)
- [ ] Parsers are memory-safe (no unbounded `memcpy`/`strcpy`, fuzz-tested where feasible)
- [ ] Radio / wireless links use encryption and mutual authentication (no fixed/static keys)

## 6. Memory & Runtime Safety

- [ ] No unsafe string/memory functions: `strcpy`, `strcat`, `sprintf`, unbounded `memcpy`
- [ ] All buffers length-checked; no out-of-bounds read/write
- [ ] Integer overflow/underflow guarded on size/length/offset calculations
- [ ] Variables initialized before use (RAM is undefined at power-up)
- [ ] Shared state between ISR and tasks protected (volatile + atomics/critical sections)
- [ ] ISRs are non-blocking; no dynamic allocation in real-time paths
- [ ] Stack overflows mitigated (bounded recursion, stack guards, MPU stack protection)

## 7. Isolation & Least Privilege

- [ ] MPU/MMU partitions isolate untrusted code and data
- [ ] Kernel/hypervisor vs. task privilege separation enforced
- [ ] Tasks granted only the peripherals/memory they need
- [ ] Untrusted input handlers run with minimal privileges

## 8. Physical & Side-Channel Considerations

- [ ] Sensitive operations use constant-time comparisons (no timing oracle)
- [ ] Debug fuses / readout protection enabled to hinder firmware extraction
- [ ] Tamper-evident / tamper-response mechanisms where the threat model requires
- [ ] Fault-injection (glitching) considerations documented where applicable

## 9. Logging, Errors & Availability

- [ ] Errors fail closed (deny on failure, not grant)
- [ ] Security-relevant events (auth failures, update attempts) are logged without secrets
- [ ] Watchdog / brown-out recovery prevents stuck states that bypass security
- [ ] Denial-of-service vectors on the device (bus flooding, malformed packets) considered
