from setuptools import find_packages, setup

with open("requirements.txt") as f:
	install_requires = [line for line in f.read().strip().split("\n") if line.strip()]

# get version from __version__ variable in vkr_dashboards/__init__.py
from vkr_dashboards import __version__ as version

setup(
	name="vkr_dashboards",
	version=version,
	description="Sales, Purchase, Stock and HR dashboards for ERPNext / Frappe HR v16",
	author="VKR Holdings",
	author_email="lubaina@vkrholdings.com",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires,
)
