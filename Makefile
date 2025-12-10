# Makefile - delegate canonical test to ALN cross-runtime harness
test:
	@if [ -x .aln/run-tests.sh ]; then \
		./.aln/run-tests.sh; \
	else \
		pwsh -ExecutionPolicy Bypass -File .aln/run-tests.ps1; \
	fi
