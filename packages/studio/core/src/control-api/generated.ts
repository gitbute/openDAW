// This file is generated. Do not edit manually.
import type {GeneratedManifest} from "./types"

export const generatedControlManifest: GeneratedManifest = {
    "operations": [
        {
            "id": "project.setBpm",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "setBpm",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "value",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.createAnyInstrument",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAnyInstrument",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "factory",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "factory",
                        "factory": "instrument"
                    }
                }
            ],
            "result": {
                "kind": "object",
                "name": "InstrumentProduct",
                "properties": [
                    {
                        "name": "audioUnitBox",
                        "optional": false,
                        "type": {
                            "kind": "handle",
                            "handle": "box",
                            "name": "AudioUnitBox"
                        }
                    },
                    {
                        "name": "instrumentBox",
                        "optional": false,
                        "type": {
                            "kind": "union",
                            "alternatives": [
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "ApparatDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "CubedDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "TapeDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "VaporisateurDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "NeonDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "NanoDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "PlayfieldDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "SoundfontDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "MIDIOutputDeviceBox"
                                }
                            ]
                        }
                    },
                    {
                        "name": "trackBox",
                        "optional": false,
                        "type": {
                            "kind": "handle",
                            "handle": "box",
                            "name": "TrackBox"
                        }
                    }
                ]
            }
        },
        {
            "id": "project.createAudioBus",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAudioBus",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "name",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                },
                {
                    "name": "type",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "literal",
                        "values": [
                            "bus",
                            "aux"
                        ]
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "AudioBusBox"
            }
        },
        {
            "id": "project.routeOutput",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "routeOutput",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                },
                {
                    "name": "target",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "nullable",
                        "value": {
                            "kind": "handle",
                            "handle": "box",
                            "name": "AudioBusBox"
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.createAuxSend",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAuxSend",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                },
                {
                    "name": "targetBus",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioBusBox"
                    }
                },
                {
                    "name": "sendGain",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number"
                    }
                },
                {
                    "name": "sendPan",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number"
                    }
                },
                {
                    "name": "routing",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "AuxSendBox"
            }
        },
        {
            "id": "project.deleteAuxSend",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteAuxSend",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "send",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AuxSendBox"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.assignSample",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "assignSample",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NanoDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "PlayfieldDeviceBox"
                            }
                        ]
                    }
                },
                {
                    "name": "sample",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "object",
                        "name": "SampleReference",
                        "properties": [
                            {
                                "name": "durationInSeconds",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "name",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            },
                            {
                                "name": "uuid",
                                "optional": false,
                                "type": {
                                    "kind": "uuid"
                                }
                            }
                        ]
                    }
                },
                {
                    "name": "slot",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.removeSample",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "removeSample",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NanoDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "PlayfieldDeviceBox"
                            }
                        ]
                    }
                },
                {
                    "name": "slot",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.insertEffect",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "insertEffect",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "field",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "EffectPointerType"
                    }
                },
                {
                    "name": "factory",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "factory",
                        "factory": "effect"
                    }
                },
                {
                    "name": "insertIndex",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "union",
                "alternatives": [
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ArpeggioDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "PitchDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "VelocityDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ZeitgeistDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "UnknownMidiEffectDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "SpielwerkDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "MaximizerDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "DelayDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ReverbDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "RevampDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StereoToolDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TidalDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ModularDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "UnknownAudioEffectDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "CompressorDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "GateDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AutotuneDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ConvolverDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "CrusherDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "FoldDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "DattorroReverbDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "NeuralAmpDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "VocoderDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "WaveshaperDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "WerkstattDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioEffectCompositeBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StereoCompositeBox"
                    }
                ]
            }
        },
        {
            "id": "project.moveEffects",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "moveEffects",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "targetField",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "EffectPointerType"
                    }
                },
                {
                    "name": "boxes",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "union",
                            "alternatives": [
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "ArpeggioDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "PitchDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "VelocityDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "ZeitgeistDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "UnknownMidiEffectDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "SpielwerkDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "MaximizerDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "DelayDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "ReverbDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "RevampDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "StereoToolDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "TidalDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "ModularDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "UnknownAudioEffectDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "CompressorDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "GateDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "AutotuneDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "ConvolverDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "CrusherDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "FoldDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "DattorroReverbDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "NeuralAmpDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "VocoderDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "WaveshaperDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "WerkstattDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "AudioEffectCompositeBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "StereoCompositeBox"
                                }
                            ]
                        }
                    }
                },
                {
                    "name": "insertIndex",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.deleteEffect",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteEffect",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "effect",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ArpeggioDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "PitchDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "VelocityDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ZeitgeistDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "UnknownMidiEffectDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "SpielwerkDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "MaximizerDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "DelayDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ReverbDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "RevampDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StereoToolDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "TidalDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ModularDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "UnknownAudioEffectDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "CompressorDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "GateDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AutotuneDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ConvolverDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "CrusherDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "FoldDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "DattorroReverbDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NeuralAmpDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "VocoderDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "WaveshaperDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "WerkstattDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AudioEffectCompositeBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StereoCompositeBox"
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.moveEffect",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "moveEffect",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "effect",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ArpeggioDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "PitchDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "VelocityDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ZeitgeistDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "UnknownMidiEffectDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "SpielwerkDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "MaximizerDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "DelayDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ReverbDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "RevampDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StereoToolDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "TidalDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ModularDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "UnknownAudioEffectDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "CompressorDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "GateDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AutotuneDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ConvolverDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "CrusherDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "FoldDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "DattorroReverbDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NeuralAmpDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "VocoderDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "WaveshaperDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "WerkstattDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AudioEffectCompositeBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StereoCompositeBox"
                            }
                        ]
                    }
                },
                {
                    "name": "targetField",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "EffectPointerType"
                    }
                },
                {
                    "name": "insertIndex",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.createNoteTrack",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createNoteTrack",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                },
                {
                    "name": "insertIndex",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "TrackBox"
            }
        },
        {
            "id": "project.createAudioTrack",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAudioTrack",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                },
                {
                    "name": "insertIndex",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "TrackBox"
            }
        },
        {
            "id": "project.createAutomationTrack",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAutomationTrack",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                },
                {
                    "name": "target",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "Pointers.Automation"
                    }
                },
                {
                    "name": "insertIndex",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "TrackBox"
            }
        },
        {
            "id": "project.compactTracks",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "compactTracks",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.createNoteClip",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createNoteClip",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "clipIndex",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                },
                {
                    "name": "arg2",
                    "optional": true,
                    "binding": "pattern",
                    "type": {
                        "kind": "object",
                        "name": "ClipRegionOptions",
                        "properties": [
                            {
                                "name": "hue",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "name",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "NoteClipBox"
            }
        },
        {
            "id": "project.createAudioClip",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAudioClip",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "audioFileBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioFileBox"
                    }
                },
                {
                    "name": "clipIndex",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                },
                {
                    "name": "duration",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                },
                {
                    "name": "name",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "AudioClipBox"
            }
        },
        {
            "id": "project.createAudioRegion",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAudioRegion",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "audioFileBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioFileBox"
                    }
                },
                {
                    "name": "position",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                },
                {
                    "name": "duration",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                },
                {
                    "name": "name",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "AudioRegionBox"
            }
        },
        {
            "id": "project.deleteTrack",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteTrack",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.renameTrack",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "renameTrack",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "name",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.moveTrack",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "moveTrack",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "delta",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.deleteRegion",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteRegion",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "region",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AudioRegionBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteRegionBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ValueRegionBox"
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.deleteClip",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteClip",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "clip",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AudioClipBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteClipBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ValueClipBox"
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.quantiseNotes",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "quantiseNotes",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "notes",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteEventCollectionBox"
                            },
                            {
                                "kind": "array",
                                "element": {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "NoteEventBox"
                                }
                            }
                        ]
                    }
                },
                {
                    "name": "arg1",
                    "optional": false,
                    "binding": "pattern",
                    "type": {
                        "kind": "object",
                        "name": "QuantiseNotesOptions",
                        "properties": [
                            {
                                "name": "durationQuantisation",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "offset",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "positionQuantisation",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.createValueClip",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createValueClip",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "clipIndex",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                },
                {
                    "name": "arg2",
                    "optional": true,
                    "binding": "pattern",
                    "type": {
                        "kind": "object",
                        "name": "ClipRegionOptions",
                        "properties": [
                            {
                                "name": "hue",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "name",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "ValueClipBox"
            }
        },
        {
            "id": "project.createNoteRegion",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createNoteRegion",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "arg0",
                    "optional": false,
                    "binding": "pattern",
                    "type": {
                        "kind": "object",
                        "name": "NoteRegionParams",
                        "properties": [
                            {
                                "name": "duration",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "eventCollection",
                                "optional": true,
                                "type": {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "NoteEventCollectionBox"
                                }
                            },
                            {
                                "name": "eventOffset",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "hue",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "loopDuration",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "loopOffset",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "mute",
                                "optional": true,
                                "type": {
                                    "kind": "literal",
                                    "values": [
                                        false,
                                        true
                                    ]
                                }
                            },
                            {
                                "name": "name",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            },
                            {
                                "name": "position",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "trackBox",
                                "optional": false,
                                "type": {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "TrackBox"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "NoteRegionBox"
            }
        },
        {
            "id": "project.createTrackRegion",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createTrackRegion",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "position",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                },
                {
                    "name": "duration",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                },
                {
                    "name": "arg3",
                    "optional": true,
                    "binding": "pattern",
                    "type": {
                        "kind": "object",
                        "name": "ClipRegionOptions",
                        "properties": [
                            {
                                "name": "hue",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "name",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "option",
                "value": {
                    "kind": "union",
                    "alternatives": [
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "AudioRegionBox"
                        },
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "NoteRegionBox"
                        },
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "ValueRegionBox"
                        }
                    ]
                }
            }
        },
        {
            "id": "project.createNoteEvent",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createNoteEvent",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "arg0",
                    "optional": false,
                    "binding": "pattern",
                    "type": {
                        "kind": "object",
                        "name": "NoteEventParams",
                        "properties": [
                            {
                                "name": "cent",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "chance",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "duration",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "owner",
                                "optional": false,
                                "type": {
                                    "kind": "object",
                                    "properties": [
                                        {
                                            "name": "events",
                                            "optional": false,
                                            "type": {
                                                "kind": "handle",
                                                "handle": "field",
                                                "name": "Field",
                                                "constraint": "Pointers.NoteEventCollection"
                                            }
                                        }
                                    ]
                                }
                            },
                            {
                                "name": "pitch",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "position",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "velocity",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "float"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "NoteEventBox"
            }
        },
        {
            "id": "project.createNoteEvents",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createNoteEvents",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "collection",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "Pointers.NoteEventCollection"
                    }
                },
                {
                    "name": "events",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "object",
                            "name": "NoteEventInput",
                            "properties": [
                                {
                                    "name": "cent",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number"
                                    }
                                },
                                {
                                    "name": "chance",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "duration",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "ppqn"
                                    }
                                },
                                {
                                    "name": "pitch",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "playCount",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "position",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "ppqn"
                                    }
                                },
                                {
                                    "name": "velocity",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "float"
                                    }
                                }
                            ]
                        }
                    }
                }
            ],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "handle",
                    "handle": "box",
                    "name": "NoteEventBox"
                }
            }
        },
        {
            "id": "project.deleteNoteEvents",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteNoteEvents",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "events",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "handle",
                            "handle": "box",
                            "name": "NoteEventBox"
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.createValueEvents",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createValueEvents",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "collection",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "Pointers.ValueEventCollection"
                    }
                },
                {
                    "name": "events",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "object",
                            "name": "ValueEventInput",
                            "properties": [
                                {
                                    "name": "index",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "interpolation",
                                    "optional": true,
                                    "type": {
                                        "kind": "literal",
                                        "values": [
                                            "none",
                                            "linear",
                                            "curve"
                                        ]
                                    }
                                },
                                {
                                    "name": "position",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "ppqn"
                                    }
                                },
                                {
                                    "name": "slope",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "unitValue"
                                    }
                                },
                                {
                                    "name": "value",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "unitValue"
                                    }
                                }
                            ]
                        }
                    }
                }
            ],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "handle",
                    "handle": "box",
                    "name": "ValueEventBox"
                }
            }
        },
        {
            "id": "project.replaceValueEvents",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "replaceValueEvents",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "collection",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "Pointers.ValueEventCollection"
                    }
                },
                {
                    "name": "events",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "object",
                            "name": "ValueEventInput",
                            "properties": [
                                {
                                    "name": "index",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "interpolation",
                                    "optional": true,
                                    "type": {
                                        "kind": "literal",
                                        "values": [
                                            "none",
                                            "linear",
                                            "curve"
                                        ]
                                    }
                                },
                                {
                                    "name": "position",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "ppqn"
                                    }
                                },
                                {
                                    "name": "slope",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "unitValue"
                                    }
                                },
                                {
                                    "name": "value",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "unitValue"
                                    }
                                }
                            ]
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.updateValueEvent",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "updateValueEvent",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "event",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ValueEventBox"
                    }
                },
                {
                    "name": "position",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                },
                {
                    "name": "index",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                },
                {
                    "name": "value",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "unitValue"
                    }
                },
                {
                    "name": "interpolation",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "literal",
                        "values": [
                            "none",
                            "linear",
                            "curve"
                        ]
                    }
                },
                {
                    "name": "slope",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "unitValue"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.deleteValueEvents",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteValueEvents",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "events",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "handle",
                            "handle": "box",
                            "name": "ValueEventBox"
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.applyPreset",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "applyPreset",
            "target": "singleton",
            "transaction": "none",
            "async": true,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AudioUnitBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ArpeggioDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "PitchDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "VelocityDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ZeitgeistDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "UnknownMidiEffectDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "SpielwerkDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "MaximizerDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "DelayDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ReverbDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "RevampDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StereoToolDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "TidalDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ModularDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "UnknownAudioEffectDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "CompressorDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "GateDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AutotuneDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ConvolverDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "CrusherDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "FoldDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "DattorroReverbDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NeuralAmpDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "VocoderDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "WaveshaperDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "WerkstattDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AudioEffectCompositeBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StereoCompositeBox"
                            }
                        ]
                    }
                },
                {
                    "name": "uuid",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "uuid"
                    }
                },
                {
                    "name": "options",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "object",
                        "name": "PresetApplyOptions",
                        "properties": [
                            {
                                "name": "insertIndex",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "keepAudioEffects",
                                "optional": true,
                                "type": {
                                    "kind": "literal",
                                    "values": [
                                        false,
                                        true
                                    ]
                                }
                            },
                            {
                                "name": "keepMIDIEffects",
                                "optional": true,
                                "type": {
                                    "kind": "literal",
                                    "values": [
                                        false,
                                        true
                                    ]
                                }
                            },
                            {
                                "name": "keepTimeline",
                                "optional": true,
                                "type": {
                                    "kind": "literal",
                                    "values": [
                                        false,
                                        true
                                    ]
                                }
                            },
                            {
                                "name": "source",
                                "optional": true,
                                "type": {
                                    "kind": "literal",
                                    "values": [
                                        "stock",
                                        "user"
                                    ]
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.deleteAudioUnit",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteAudioUnit",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.duplicateNotes",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "duplicateNotes",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "notes",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "handle",
                            "handle": "adapter",
                            "name": "NoteEventBoxAdapter"
                        }
                    }
                }
            ],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "handle",
                    "handle": "adapter",
                    "name": "NoteEventBoxAdapter"
                }
            },
            "description": "Duplicate a set of notes so that the copies land flush after the\r\nsource block: each copy is shifted by `max(position + duration) −\r\nmin(position)` over the input. Returns the newly created note\r\nadapters in the same order as `notes`, so the caller can swap its\r\nselection in one pass. Returns an empty array when the input is\r\nempty or the computed shift is zero. The caller is responsible for\r\nwrapping the call in `editing.modify(...)`."
        },
        {
            "id": "project.modulation.adapters",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "adapters",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "handle",
                    "handle": "adapter",
                    "name": "ModulatorBoxAdapter"
                }
            }
        },
        {
            "id": "project.modulation.createLfo",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "createLfo",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "label",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "union",
                "alternatives": [
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "LfoModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StepsModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "MacroModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "RandomModulatorBox"
                    }
                ]
            }
        },
        {
            "id": "project.modulation.createSteps",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "createSteps",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "label",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "union",
                "alternatives": [
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "LfoModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StepsModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "MacroModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "RandomModulatorBox"
                    }
                ]
            }
        },
        {
            "id": "project.modulation.createMacro",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "createMacro",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "label",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "union",
                "alternatives": [
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "LfoModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StepsModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "MacroModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "RandomModulatorBox"
                    }
                ]
            }
        },
        {
            "id": "project.modulation.createRandom",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "createRandom",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "label",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "union",
                "alternatives": [
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "LfoModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StepsModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "MacroModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "RandomModulatorBox"
                    }
                ]
            }
        },
        {
            "id": "project.modulation.assign",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "assign",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "modulator",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "LfoModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StepsModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "MacroModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "RandomModulatorBox"
                            }
                        ]
                    }
                },
                {
                    "name": "target",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "Pointers.Modulation"
                    }
                },
                {
                    "name": "depth",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "unitValue"
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "ModulationBox"
            }
        },
        {
            "id": "project.modulation.duplicate",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "duplicate",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "modulator",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "LfoModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StepsModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "MacroModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "RandomModulatorBox"
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "union",
                "alternatives": [
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "LfoModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StepsModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "MacroModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "RandomModulatorBox"
                    }
                ]
            }
        },
        {
            "id": "project.modulation.duplicateAll",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "duplicateAll",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "modulators",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "union",
                            "alternatives": [
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "LfoModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "StepsModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "MacroModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "RandomModulatorBox"
                                }
                            ]
                        }
                    }
                }
            ],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "union",
                    "alternatives": [
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "LfoModulatorBox"
                        },
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "StepsModulatorBox"
                        },
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "MacroModulatorBox"
                        },
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "RandomModulatorBox"
                        }
                    ]
                }
            }
        },
        {
            "id": "project.modulation.delete",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "delete",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "modulator",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "LfoModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StepsModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "MacroModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "RandomModulatorBox"
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.modulation.deleteAll",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "deleteAll",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "modulators",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "union",
                            "alternatives": [
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "LfoModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "StepsModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "MacroModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "RandomModulatorBox"
                                }
                            ]
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.modulation.move",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "move",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "modulators",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "union",
                            "alternatives": [
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "LfoModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "StepsModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "MacroModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "RandomModulatorBox"
                                }
                            ]
                        }
                    }
                },
                {
                    "name": "target",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "LfoModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StepsModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "MacroModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "RandomModulatorBox"
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.play",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "play",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.stop",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "stop",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "reset",
                    "optional": true,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "boolean"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.setPosition",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "setPosition",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "position",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.prepareRecordingState",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "prepareRecordingState",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "countIn",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "boolean"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.stopRecording",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "stopRecording",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.isReady",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "isReady",
            "target": "singleton",
            "transaction": "none",
            "async": true,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.queryLoadingComplete",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "queryLoadingComplete",
            "target": "singleton",
            "transaction": "none",
            "async": true,
            "parameters": [],
            "result": {
                "kind": "primitive",
                "type": "boolean"
            }
        },
        {
            "id": "transport.panic",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "panic",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.sleep",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "sleep",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.wake",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "wake",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.ignoreNoteRegion",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "ignoreNoteRegion",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "uuid",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "uuid"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.suspendAutomation",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "suspendAutomation",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "uuid",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "uuid"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.noteSignal",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "noteSignal",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "signal",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "object",
                                "name": "NoteSignalOn",
                                "properties": [
                                    {
                                        "name": "pitch",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number",
                                            "semantic": "byte"
                                        }
                                    },
                                    {
                                        "name": "type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "uuid",
                                        "optional": false,
                                        "type": {
                                            "kind": "uuid"
                                        }
                                    },
                                    {
                                        "name": "velocity",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number",
                                            "semantic": "unitValue"
                                        }
                                    }
                                ]
                            },
                            {
                                "kind": "object",
                                "name": "NoteSignalOff",
                                "properties": [
                                    {
                                        "name": "pitch",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number",
                                            "semantic": "byte"
                                        }
                                    },
                                    {
                                        "name": "type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "uuid",
                                        "optional": false,
                                        "type": {
                                            "kind": "uuid"
                                        }
                                    }
                                ]
                            },
                            {
                                "kind": "object",
                                "name": "NoteSignalAudition",
                                "properties": [
                                    {
                                        "name": "duration",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number",
                                            "semantic": "ppqn"
                                        }
                                    },
                                    {
                                        "name": "pitch",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number",
                                            "semantic": "byte"
                                        }
                                    },
                                    {
                                        "name": "type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "uuid",
                                        "optional": false,
                                        "type": {
                                            "kind": "uuid"
                                        }
                                    },
                                    {
                                        "name": "velocity",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number",
                                            "semantic": "unitValue"
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.scheduleClipPlay",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "scheduleClipPlay",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "clipIds",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "uuid"
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.scheduleClipStop",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "scheduleClipStop",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "trackIds",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "uuid"
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.unregisterMonitoringSource",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "unregisterMonitoringSource",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "uuid",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "uuid"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "parameter.valueAt",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "valueAt",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "position",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                }
            ],
            "result": {
                "kind": "parameterValue"
            }
        },
        {
            "id": "parameter.notifyPrinting",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "notifyPrinting",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "parameter.getValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "getValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "parameterValue"
            }
        },
        {
            "id": "parameter.setValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "setValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "value",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "parameterValue"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "parameter.setUnitValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "setUnitValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "value",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "unitValue"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "parameter.getUnitValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "getUnitValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "primitive",
                "type": "number",
                "semantic": "unitValue"
            }
        },
        {
            "id": "parameter.getControlledValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "getControlledValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "parameterValue"
            }
        },
        {
            "id": "parameter.getControlledUnitValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "getControlledUnitValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "primitive",
                "type": "number",
                "semantic": "unitValue"
            }
        },
        {
            "id": "parameter.getControlledPrintValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "getControlledPrintValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "object",
                "name": "Readonly",
                "properties": [
                    {
                        "name": "unit",
                        "optional": false,
                        "type": {
                            "kind": "primitive",
                            "type": "string"
                        }
                    },
                    {
                        "name": "value",
                        "optional": false,
                        "type": {
                            "kind": "primitive",
                            "type": "string"
                        }
                    }
                ]
            }
        },
        {
            "id": "parameter.getPrintValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "getPrintValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "object",
                "name": "Readonly",
                "properties": [
                    {
                        "name": "unit",
                        "optional": false,
                        "type": {
                            "kind": "primitive",
                            "type": "string"
                        }
                    },
                    {
                        "name": "value",
                        "optional": false,
                        "type": {
                            "kind": "primitive",
                            "type": "string"
                        }
                    }
                ]
            }
        },
        {
            "id": "parameter.setPrintValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "setPrintValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "text",
                    "optional": false,
                    "binding": "identifier",
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "parameter.reset",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "reset",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.resources.audioUnits",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "audioUnits",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectAudioUnitResource",
                    "properties": [
                        {
                            "name": "audioEffects",
                            "optional": false,
                            "type": {
                                "kind": "array",
                                "element": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "auxSends",
                            "optional": false,
                            "type": {
                                "kind": "array",
                                "element": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "icon",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "index",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "int"
                            }
                        },
                        {
                            "name": "label",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "midiEffects",
                            "optional": false,
                            "type": {
                                "kind": "array",
                                "element": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "mute",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "boolean"
                            }
                        },
                        {
                            "name": "output",
                            "optional": false,
                            "type": {
                                "kind": "nullable",
                                "value": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "panning",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number"
                            }
                        },
                        {
                            "name": "ref",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "solo",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "boolean"
                            }
                        },
                        {
                            "name": "tracks",
                            "optional": false,
                            "type": {
                                "kind": "array",
                                "element": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "type",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "volume",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number"
                            }
                        }
                    ]
                }
            }
        },
        {
            "id": "project.resources.buses",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "buses",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectBusResource",
                    "properties": [
                        {
                            "name": "audioEffects",
                            "optional": false,
                            "type": {
                                "kind": "array",
                                "element": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "auxSends",
                            "optional": false,
                            "type": {
                                "kind": "array",
                                "element": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "color",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "enabled",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "boolean"
                            }
                        },
                        {
                            "name": "icon",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "label",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "midiEffects",
                            "optional": false,
                            "type": {
                                "kind": "array",
                                "element": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "output",
                            "optional": false,
                            "type": {
                                "kind": "nullable",
                                "value": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "ref",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "type",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "unit",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            }
        },
        {
            "id": "project.resources.devices",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "devices",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectDeviceResource",
                    "properties": [
                        {
                            "name": "accepts",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "box",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "enabled",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "boolean"
                            }
                        },
                        {
                            "name": "host",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "index",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "int"
                            }
                        },
                        {
                            "name": "label",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "name",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "ref",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "type",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        }
                    ]
                }
            }
        },
        {
            "id": "project.resources.parameters",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "parameters",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectParameterResource",
                    "properties": [
                        {
                            "name": "choices",
                            "optional": false,
                            "type": {
                                "kind": "array",
                                "element": {
                                    "kind": "object",
                                    "name": "ProjectResourceChoice",
                                    "properties": [
                                        {
                                            "name": "label",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "unit",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "value",
                                            "optional": false,
                                            "type": {
                                                "kind": "union",
                                                "alternatives": [
                                                    {
                                                        "kind": "primitive",
                                                        "type": "string"
                                                    },
                                                    {
                                                        "kind": "primitive",
                                                        "type": "number"
                                                    },
                                                    {
                                                        "kind": "primitive",
                                                        "type": "boolean"
                                                    },
                                                    {
                                                        "kind": "primitive",
                                                        "type": "boolean"
                                                    }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "constraints",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceConstraint",
                                "properties": [
                                    {
                                        "name": "kind",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "length",
                                        "optional": true,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number",
                                            "semantic": "int"
                                        }
                                    },
                                    {
                                        "name": "max",
                                        "optional": true,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number"
                                        }
                                    },
                                    {
                                        "name": "mid",
                                        "optional": true,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number"
                                        }
                                    },
                                    {
                                        "name": "min",
                                        "optional": true,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number"
                                        }
                                    },
                                    {
                                        "name": "scaling",
                                        "optional": true,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "values",
                                        "optional": true,
                                        "type": {
                                            "kind": "array",
                                            "element": {
                                                "kind": "primitive",
                                                "type": "number"
                                            }
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "controlledPrintUnit",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "controlledPrintValue",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "controlledValue",
                            "optional": false,
                            "type": {
                                "kind": "union",
                                "alternatives": [
                                    {
                                        "kind": "literal",
                                        "values": [
                                            null
                                        ]
                                    },
                                    {
                                        "kind": "primitive",
                                        "type": "string"
                                    },
                                    {
                                        "kind": "primitive",
                                        "type": "number"
                                    },
                                    {
                                        "kind": "primitive",
                                        "type": "boolean"
                                    },
                                    {
                                        "kind": "primitive",
                                        "type": "boolean"
                                    },
                                    {
                                        "kind": "array",
                                        "element": {
                                            "kind": "primitive",
                                            "type": "number"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "field",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "name",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "owner",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "path",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "primitiveType",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "printUnit",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "printValue",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "rawValue",
                            "optional": false,
                            "type": {
                                "kind": "union",
                                "alternatives": [
                                    {
                                        "kind": "literal",
                                        "values": [
                                            null
                                        ]
                                    },
                                    {
                                        "kind": "primitive",
                                        "type": "string"
                                    },
                                    {
                                        "kind": "primitive",
                                        "type": "number"
                                    },
                                    {
                                        "kind": "primitive",
                                        "type": "boolean"
                                    },
                                    {
                                        "kind": "primitive",
                                        "type": "boolean"
                                    },
                                    {
                                        "kind": "array",
                                        "element": {
                                            "kind": "primitive",
                                            "type": "number"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "ref",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "unit",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "unitValue",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "unitValue"
                            }
                        }
                    ]
                }
            }
        },
        {
            "id": "project.resources.tracks",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "tracks",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectTrackResource",
                    "properties": [
                        {
                            "name": "clips",
                            "optional": false,
                            "type": {
                                "kind": "array",
                                "element": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "enabled",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "boolean"
                            }
                        },
                        {
                            "name": "index",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "int"
                            }
                        },
                        {
                            "name": "owner",
                            "optional": false,
                            "type": {
                                "kind": "nullable",
                                "value": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "ref",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "regions",
                            "optional": false,
                            "type": {
                                "kind": "array",
                                "element": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "target",
                            "optional": false,
                            "type": {
                                "kind": "nullable",
                                "value": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "targetControlName",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "targetName",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "type",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        }
                    ]
                }
            }
        },
        {
            "id": "project.resources.regions",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "regions",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectRegionResource",
                    "properties": [
                        {
                            "name": "duration",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "ppqn"
                            }
                        },
                        {
                            "name": "events",
                            "optional": false,
                            "type": {
                                "kind": "nullable",
                                "value": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "label",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "loopDuration",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "ppqn"
                            }
                        },
                        {
                            "name": "loopOffset",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "ppqn"
                            }
                        },
                        {
                            "name": "mute",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "boolean"
                            }
                        },
                        {
                            "name": "position",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "ppqn"
                            }
                        },
                        {
                            "name": "ref",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "track",
                            "optional": false,
                            "type": {
                                "kind": "nullable",
                                "value": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "type",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        }
                    ]
                }
            }
        },
        {
            "id": "project.resources.clips",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "clips",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectClipResource",
                    "properties": [
                        {
                            "name": "duration",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "ppqn"
                            }
                        },
                        {
                            "name": "events",
                            "optional": false,
                            "type": {
                                "kind": "nullable",
                                "value": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "index",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "int"
                            }
                        },
                        {
                            "name": "label",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "mute",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "boolean"
                            }
                        },
                        {
                            "name": "ref",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "track",
                            "optional": false,
                            "type": {
                                "kind": "nullable",
                                "value": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "type",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        }
                    ]
                }
            }
        },
        {
            "id": "project.resources.events",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "events",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectEventResource",
                    "properties": [
                        {
                            "name": "cent",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "number"
                            }
                        },
                        {
                            "name": "chance",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "int"
                            }
                        },
                        {
                            "name": "duration",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "ppqn"
                            }
                        },
                        {
                            "name": "index",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "int"
                            }
                        },
                        {
                            "name": "interpolation",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "owner",
                            "optional": false,
                            "type": {
                                "kind": "nullable",
                                "value": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "pitch",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "int"
                            }
                        },
                        {
                            "name": "playCount",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "int"
                            }
                        },
                        {
                            "name": "position",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "ppqn"
                            }
                        },
                        {
                            "name": "ref",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "type",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "value",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "unitValue"
                            }
                        },
                        {
                            "name": "velocity",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "number"
                            }
                        }
                    ]
                }
            }
        },
        {
            "id": "project.resources.playfieldSlots",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "playfieldSlots",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectPlayfieldSlotResource",
                    "properties": [
                        {
                            "name": "audioEffects",
                            "optional": false,
                            "type": {
                                "kind": "array",
                                "element": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "device",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "name": "file",
                            "optional": false,
                            "type": {
                                "kind": "nullable",
                                "value": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "fileName",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "index",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "int"
                            }
                        },
                        {
                            "name": "midiEffects",
                            "optional": false,
                            "type": {
                                "kind": "array",
                                "element": {
                                    "kind": "object",
                                    "name": "ProjectResourceRef",
                                    "properties": [
                                        {
                                            "name": "$address",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        },
                                        {
                                            "name": "$type",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "string"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "name": "ref",
                            "optional": false,
                            "type": {
                                "kind": "object",
                                "name": "ProjectResourceRef",
                                "properties": [
                                    {
                                        "name": "$address",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "$type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            }
        },
        {
            "id": "project.resources.instrumentFactories",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "instrumentFactories",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectFactoryResource",
                    "properties": [
                        {
                            "name": "briefDescription",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "description",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "icon",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "key",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "kind",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "manualPage",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "name",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "trackType",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        }
                    ]
                }
            }
        },
        {
            "id": "project.resources.midiEffectFactories",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "midiEffectFactories",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectFactoryResource",
                    "properties": [
                        {
                            "name": "briefDescription",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "description",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "icon",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "key",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "kind",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "manualPage",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "name",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "trackType",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        }
                    ]
                }
            }
        },
        {
            "id": "project.resources.audioEffectFactories",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "audioEffectFactories",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectFactoryResource",
                    "properties": [
                        {
                            "name": "briefDescription",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "description",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "icon",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "key",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "kind",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "manualPage",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "name",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "trackType",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        }
                    ]
                }
            }
        },
        {
            "id": "project.resources.samples",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "samples",
            "target": "singleton",
            "transaction": "none",
            "async": true,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectSampleResource",
                    "properties": [
                        {
                            "name": "bpm",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number"
                            }
                        },
                        {
                            "name": "custom",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "duration",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number"
                            }
                        },
                        {
                            "name": "name",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "origin",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "sampleRate",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number"
                            }
                        },
                        {
                            "name": "uuid",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        }
                    ]
                }
            }
        },
        {
            "id": "project.resources.soundfonts",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "soundfonts",
            "target": "singleton",
            "transaction": "none",
            "async": true,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectSoundfontResource",
                    "properties": [
                        {
                            "name": "license",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "name",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "origin",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "size",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number",
                                "semantic": "int"
                            }
                        },
                        {
                            "name": "url",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "uuid",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        }
                    ]
                }
            }
        },
        {
            "id": "project.resources.presets",
            "root": "resources",
            "ownerType": "ProjectResources",
            "method": "presets",
            "target": "singleton",
            "transaction": "none",
            "async": true,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "object",
                    "name": "ProjectPresetResource",
                    "properties": [
                        {
                            "name": "category",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "created",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number"
                            }
                        },
                        {
                            "name": "description",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "device",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "hasTimeline",
                            "optional": true,
                            "type": {
                                "kind": "literal",
                                "values": [
                                    false,
                                    true
                                ]
                            }
                        },
                        {
                            "name": "instrument",
                            "optional": true,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "modified",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "number"
                            }
                        },
                        {
                            "name": "name",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        },
                        {
                            "name": "uuid",
                            "optional": false,
                            "type": {
                                "kind": "primitive",
                                "type": "string"
                            }
                        }
                    ]
                }
            }
        }
    ],
    "skipped": [
        {
            "root": "ProjectApi",
            "method": "catchupAndSubscribeBpm",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "ProjectApi",
            "method": "catchupAndSubscribeAudioUnits",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "ProjectApi",
            "method": "createInstrument",
            "reason": "generic method signature is not instantiated"
        },
        {
            "root": "ProjectApi",
            "method": "replaceMIDIInstrument",
            "reason": "generic method signature is not instantiated"
        },
        {
            "root": "ProjectApi",
            "method": "duplicateRegion",
            "reason": "generic method signature is not instantiated"
        },
        {
            "root": "ProjectModulation",
            "method": "create",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "ProjectModulation",
            "method": "replace",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "EngineFacade",
            "method": "setWorklet",
            "reason": "lifecycle/worklet infrastructure method"
        },
        {
            "root": "EngineFacade",
            "method": "assertWorklet",
            "reason": "lifecycle/worklet infrastructure method"
        },
        {
            "root": "EngineFacade",
            "method": "releaseWorklet",
            "reason": "lifecycle/worklet infrastructure method"
        },
        {
            "root": "EngineFacade",
            "method": "subscribeClipNotification",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "EngineFacade",
            "method": "subscribeNotes",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "EngineFacade",
            "method": "subscribeDeviceMessage",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "EngineFacade",
            "method": "registerMonitoringSource",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "EngineFacade",
            "method": "terminate",
            "reason": "lifecycle/worklet infrastructure method"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "registerMidiControl",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "catchupAndSubscribeName",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "registerTracks",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "subscribe",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "catchupAndSubscribe",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "catchupAndSubscribeControlSources",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "terminate",
            "reason": "lifecycle/worklet infrastructure method"
        }
    ],
    "unsupported": [
        {
            "root": "ProjectApi",
            "method": "createTimeStretchedClip",
            "reason": "BoxGraph<any>: unrecognised class/resource type"
        },
        {
            "root": "ProjectApi",
            "method": "createTimeStretchedRegion",
            "reason": "BoxGraph<any>: unrecognised class/resource type"
        },
        {
            "root": "ProjectApi",
            "method": "createPitchStretchedClip",
            "reason": "BoxGraph<any>: unrecognised class/resource type"
        },
        {
            "root": "ProjectApi",
            "method": "createPitchStretchedRegion",
            "reason": "BoxGraph<any>: unrecognised class/resource type"
        },
        {
            "root": "ProjectApi",
            "method": "createNotStretchedClip",
            "reason": "BoxGraph<any>: unrecognised class/resource type"
        },
        {
            "root": "ProjectApi",
            "method": "createNotStretchedRegion",
            "reason": "BoxGraph<any>: unrecognised class/resource type"
        },
        {
            "root": "ProjectApi",
            "method": "exportMIDI",
            "reason": "RejectedResult: unrecognised class/resource type"
        },
        {
            "root": "ProjectApi",
            "method": "exportAudio",
            "reason": "RejectedResult: unrecognised class/resource type"
        },
        {
            "root": "EngineFacade",
            "method": "loadClickSound",
            "reason": "() => ArrayIterator<number>: function/constructor type"
        },
        {
            "root": "EngineFacade",
            "method": "setFrozenAudio",
            "reason": "() => ArrayIterator<number>: function/constructor type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "optTracks",
            "reason": "(listener: IndexedAdapterCollectionListener<TrackBoxAdapter>) => Terminable: function/constructor type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "updateMappings",
            "reason": "(y: T) => T: function/constructor type"
        }
    ]
}
