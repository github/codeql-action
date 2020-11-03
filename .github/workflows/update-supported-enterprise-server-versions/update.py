#!/usr/bin/env python3
import datetime
import json
import os
import pathlib

import semver

_API_COMPATIBILITY_PATH = pathlib.Path(__file__).absolute().parents[3] / "src" / "api-compatibility.json"
_ENTERPRISE_RELEASES_PATH = pathlib.Path(os.environ["ENTERPRISE_RELEASES_PATH"])
_RELEASE_FILE_PATH = _ENTERPRISE_RELEASES_PATH / "releases.json"
_FIRST_SUPPORTED_RELEASE = semver.VersionInfo.parse("2.22.0") # Versions older than this did not include Code Scanning.

def main():
	releases = json.loads(_RELEASE_FILE_PATH.read_text())
	oldest_supported_release = None
	newest_supported_release = None

	for release_version_string, release_data in releases.items():
		release_version = semver.VersionInfo.parse(release_version_string + ".0")
		if release_version < _FIRST_SUPPORTED_RELEASE:
			continue

		if newest_supported_release is None or release_version > newest_supported_release:
			feature_freeze_date = datetime.date.fromisoformat(release_data["feature_freeze"])
			if feature_freeze_date < datetime.date.today() + datetime.timedelta(weeks=2):
				newest_supported_release = release_version

		if oldest_supported_release is None or release_version < oldest_supported_release:
			end_of_life_date = datetime.date.fromisoformat(release_data["end"])
			if end_of_life_date > datetime.date.today():
				oldest_supported_release = release_version

	api_compatibility_data = {
		"minimumVersion": f"{oldest_supported_release.major}.{oldest_supported_release.minor}",
		"maximumVersion": f"{newest_supported_release.major}.{newest_supported_release.minor}",
	}
	_API_COMPATIBILITY_PATH.write_text(json.dumps(api_compatibility_data, sort_keys=True) + "\n")

if __name__ == "__main__":
	main()
