from setuptools import setup

# has fake Trove classifier to fool Python extractor to believe this is Python 3 for sure

# Programming Language :: Python :: 3.7


setup(
    name="example-setup.py",
    install_requires=["requests==2.31.0"],
    python_requires='>=3.7',
)
