"""Build the isolated native binding to the preserved reference algorithm."""

from setuptools import Extension, setup

setup(
    package_data={
        "app.thermal": ["_liljegren.pyi"],
        "app.thermal.vendor": ["README.md", "wbgt.c", "wbgt.h"],
    },
    ext_modules=[
        Extension(
            "app.thermal._liljegren",
            sources=[
                "app/thermal/vendor/module.c",
                "app/thermal/vendor/wbgt.c",
            ],
            include_dirs=["app/thermal/vendor"],
            extra_compile_args=["-std=c99", "-Wall", "-Wextra"],
        )
    ]
)
