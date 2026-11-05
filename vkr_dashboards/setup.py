from setuptools import find_packages, setup

with open("requirements.txt") as f:
	install_requires = f.read().strip().splitlines()

from vkr_dashboards import __version__ as version

setup(
	name="vkr_dashboards",
	version=version,
	description="Sales, Purchase, Stock and HR dashboards using only standard ERPNext Dashboards, Charts and Number Cards",
	author="VKR Holdings",
	author_email="lubaina@vkrholdings.com",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires,
)
