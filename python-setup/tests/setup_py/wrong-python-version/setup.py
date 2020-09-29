from setuptools import setup

# has fake Trove classifier to fool Python extractor to believe this is Python 3 for sure

# Programming Language :: Python :: 3.7


setup(
    name="example-setup.py",
    install_requires=["requests==1.2.3"],
    python_requires=">=2.7, <3",
)
