/**
 * Features as named by the GitHub API endpoint.
 *
 * Do not include the `codeql_action_` prefix as this is stripped by the API
 * endpoint.
 *
 * Legacy features should end with `_enabled`.
 */
export enum Feature {
  /** Allows supported properties of configuration files to be merged. */
  AllowMergeConfigFiles = "allow_merge_config_files",
  /** Controls whether we allow multiple values for the `analysis-kinds` input. */
  AllowMultipleAnalysisKinds = "allow_multiple_analysis_kinds",
  /**
   * Whether to check for unsupported traced analysis. Primarily intended as an override to disable
   * the check if it causes problems somehow.
   */
  CheckUnsupportedTracedAnalysis = "check_unsupported_traced_analysis",
  /** Whether to allow the `config-file` input to be specified via a repository property. */
  ConfigFileRepositoryProperty = "config_file_repository_property",
  CppDependencyInstallation = "cpp_dependency_installation_enabled",
  CsharpCacheBuildModeNone = "csharp_cache_bmn",
  CsharpNewCacheKey = "csharp_new_cache_key",
  DiffInformedQueries = "diff_informed_queries",
  DisableCsharpBuildless = "disable_csharp_buildless",
  DisableJavaBuildlessEnabled = "disable_java_buildless_enabled",
  DisableKotlinAnalysisEnabled = "disable_kotlin_analysis_enabled",
  ExportDiagnosticsEnabled = "export_diagnostics_enabled",
  /**
   * Emergency override that forces the CodeQL CLI to use the JGit-based Git backend instead of its
   * default backend selection.
   */
  ForceJGit = "force_jgit",
  ForceNightly = "force_nightly",
  IgnoreGeneratedFiles = "ignore_generated_files",
  JavaNetworkDebugging = "java_network_debugging",
  OverlayAnalysis = "overlay_analysis",
  OverlayAnalysisCodeScanningCpp = "overlay_analysis_code_scanning_cpp",
  OverlayAnalysisCodeScanningCsharp = "overlay_analysis_code_scanning_csharp",
  OverlayAnalysisCodeScanningGo = "overlay_analysis_code_scanning_go",
  OverlayAnalysisCodeScanningJava = "overlay_analysis_code_scanning_java",
  OverlayAnalysisCodeScanningJavascript = "overlay_analysis_code_scanning_javascript",
  OverlayAnalysisCodeScanningPython = "overlay_analysis_code_scanning_python",
  OverlayAnalysisCodeScanningRuby = "overlay_analysis_code_scanning_ruby",
  OverlayAnalysisCpp = "overlay_analysis_cpp",
  OverlayAnalysisCsharp = "overlay_analysis_csharp",
  OverlayAnalysisGo = "overlay_analysis_go",
  OverlayAnalysisJava = "overlay_analysis_java",
  OverlayAnalysisJavascript = "overlay_analysis_javascript",
  /**
   * Lowers the overlay minimum available disk space to 8 GB. The lowest enabled limit wins; if
   * none are enabled, the default applies.
   */
  OverlayAnalysisMinDisk8Gb = "overlay_analysis_min_disk_8_gb",
  /**
   * Lowers the overlay minimum available disk space to 9 GB. The lowest enabled limit wins; if
   * none are enabled, the default applies.
   */
  OverlayAnalysisMinDisk9Gb = "overlay_analysis_min_disk_9_gb",
  /**
   * Lowers the overlay minimum available disk space to 10 GB. The lowest enabled limit wins; if
   * none are enabled, the default applies.
   */
  OverlayAnalysisMinDisk10Gb = "overlay_analysis_min_disk_10_gb",
  /**
   * Lowers the overlay minimum available disk space to 11 GB. The lowest enabled limit wins; if
   * none are enabled, the default applies.
   */
  OverlayAnalysisMinDisk11Gb = "overlay_analysis_min_disk_11_gb",
  /**
   * Lowers the overlay minimum available disk space to 12 GB. The lowest enabled limit wins; if
   * none are enabled, the default applies.
   */
  OverlayAnalysisMinDisk12Gb = "overlay_analysis_min_disk_12_gb",
  /**
   * Lowers the overlay minimum available disk space to 13 GB. The lowest enabled limit wins; if
   * none are enabled, the default applies.
   */
  OverlayAnalysisMinDisk13Gb = "overlay_analysis_min_disk_13_gb",
  OverlayAnalysisPython = "overlay_analysis_python",
  OverlayAnalysisRuby = "overlay_analysis_ruby",
  /** Controls whether hardware checks are skipped for overlay analysis. */
  OverlayAnalysisSkipResourceChecks = "overlay_analysis_skip_resource_checks",
  /** Controls whether the Actions cache is checked for overlay build outcomes. */
  OverlayAnalysisStatusCheck = "overlay_analysis_status_check",
  /** Controls whether overlay build failures on the default branch are stored in the Actions cache. */
  OverlayAnalysisStatusSave = "overlay_analysis_status_save",
  QaTelemetryEnabled = "qa_telemetry_enabled",
  /** Whether we should fail early if we detect that traced analysis is unsupported. */
  AbortUnsupportedTracedAnalysis = "abort_unsupported_traced_analysis",
  /** Routes (some) API requests through the registry proxy. */
  ProxyApiRequests = "proxy_api_requests",
  /** Note that this currently only disables baseline file coverage information. */
  SkipFileCoverageOnPrs = "skip_file_coverage_on_prs",
  StartProxyUseFeaturesRelease = "start_proxy_use_features_release",
  /** Whether to allow the `tools` input to be specified via a repository property. */
  ToolsRepositoryProperty = "tools_repository_property",
  UploadOverlayDbToApi = "upload_overlay_db_to_api",
  ValidateDbConfig = "validate_db_config",
}
