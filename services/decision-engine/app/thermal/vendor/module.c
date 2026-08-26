/*
 * Workforce HeatOps CPython binding for the preserved Liljegren WBGT 1.1 C
 * implementation. Copyright (c) 2026 Workforce HeatOps contributors.
 *
 * This binding is original MIT-licensed glue. The linked wbgt.c derivative
 * retains its separate upstream notices and terms.
 */
#define PY_SSIZE_T_CLEAN
#include <Python.h>

#include "wbgt.h"

static PyObject *estimate(PyObject *self, PyObject *args) {
    int year, month, day, hour, minute, averaging_minutes;
    double latitude, longitude, solar, pressure, air_temperature;
    double relative_humidity, wind_speed, wind_height;
    double effective_wind, globe, natural_wet_bulb, psychrometric_wet_bulb, wbgt;
    double adjusted_solar, cosine_zenith, direct_fraction;
    double centered_day;
    int status;

    (void)self;
    if (!PyArg_ParseTuple(args, "iiiiiidddddddd", &year, &month, &day, &hour,
                          &minute, &averaging_minutes, &latitude, &longitude,
                          &solar, &pressure, &air_temperature, &relative_humidity,
                          &wind_speed, &wind_height)) {
        return NULL;
    }

    adjusted_solar = solar;
    centered_day = day + (hour + (minute - 0.5 * averaging_minutes) / 60.0) / 24.0;
    if (calc_solar_parameters(year, month, centered_day, latitude, longitude,
                              &adjusted_solar, &cosine_zenith, &direct_fraction) != 0) {
        PyErr_SetString(PyExc_ValueError, "solar-position calculation rejected the input");
        return NULL;
    }

    effective_wind = wind_speed;
    status = calc_wbgt(year, month, day, hour, minute, 0, averaging_minutes,
                       latitude, longitude, solar, pressure, air_temperature,
                       relative_humidity, wind_speed, wind_height, 0.0, 0,
                       &effective_wind, &globe, &natural_wet_bulb,
                       &psychrometric_wet_bulb, &wbgt);

    return Py_BuildValue("(iddddddd)", status, globe, natural_wet_bulb,
                         psychrometric_wet_bulb, wbgt, effective_wind,
                         adjusted_solar, cosine_zenith);
}

static PyMethodDef methods[] = {
    {"estimate", estimate, METH_VARARGS,
     "Run the preserved Liljegren WBGT 1.1 calculation."},
    {NULL, NULL, 0, NULL}
};

static struct PyModuleDef module = {
    PyModuleDef_HEAD_INIT,
    .m_name = "_liljegren",
    .m_doc = "Native binding to the preserved Liljegren WBGT 1.1 implementation.",
    .m_size = -1,
    .m_methods = methods
};

PyMODINIT_FUNC PyInit__liljegren(void) { return PyModule_Create(&module); }
