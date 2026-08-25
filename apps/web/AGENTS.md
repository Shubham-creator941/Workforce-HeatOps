# Web application instructions

The frontend is presentation and user interaction only. Never calculate WBGT, PPE adjustments, occupational limits, or schedule safety. All service calls go through Node; never call Python, MySQL, providers, or secret-bearing services directly.

Use “Estimated Outdoor WBGT,” not “Official WBGT.” Use “NIOSH/OSHA guidance-aligned,” not “OSHA compliant.” Keep accessibility, loading, failure, and empty states explicit.
