from setuptools import setup

# has fake Trove classifier to fool Python extractor to believe this is Python 2 for sure

# Programming Language :: Python :: 2.7


setup(
    name="example-setup.py",
    install_requires=["requests==2.20.0"],
    python_requires=">=2.7, <3",
)
