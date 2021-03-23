
# (ALB + Cognito): Missing connection between SecurityGroup of ALB and SecurityGroup of service.

In this sample we are using ALB and ECS Service (Fargate in this case) splitted in different stack at TargetGroup level.

When i'm using action of Forward in listner everything is fine 👌

```
let action = elbv2.ListenerAction.forward([targetgroup])
listner.addAction(`${serviceName}-listner-action`, {
  priority: serviceListnerPriority,
  hostHeader: 'sample.exemple.com',
  action: action
})
```

When i'm using action of `AuthenticateCognitoAction` before the `Forward` action
(I'm using cognito auth in from of alb, similar to [this](https://docs.aws.amazon.com/cdk/api/latest/docs/aws-elasticloadbalancingv2-actions-readme.html))

```
let action = elbv2.ListenerAction.forward([targetgroup])

action = new elbv2Actions.AuthenticateCognitoAction({
  userPool: userPool,
  userPoolClient: userPoolClientAlb,
  userPoolDomain: userPoolDomain,
  next: action,
})

listner.addAction(`${serviceName}-listner-action`, {
  priority: serviceListnerPriority,
  hostHeader: 'sample.exemple.com',
  action: action
})
```

and in my service stack the `service.attachToApplicationTargetGroup(props.albTargetGroup)` will not generate the `AWS::EC2::SecurityGroupIngress` to accept connection from ALB to the service.

---

See issue: [#12994](https://github.com/aws/aws-cdk/issues/12994)

I also add output (cdk.out) of `synth` to compare difference between stack: 

 * `service-sample-without-cognito-prod` who are only using `forward` action, stack file: `cdk.out/service-sample-without-cognito-prod.template.json`
 * `service-sample-prod` who are using `AuthenticateCognitoAction` then `forward` action, stack file: `cdk.out/service-sample-prod.template.json`
 * `service-sample-patched-prod` same as previous, but with patched SecurityGroup, stack file: `cdk.out/service-sample-patched-prod.template.json`


The main diff betweem `service-sample-prod` <=> `service-sample-without-cognito-prod` are:
 * AWS::EC2::SecurityGroupIngress
 * AWS::EC2::SecurityGroupEgress

 ```diff
+    "serviceSecurityGroupfrombaseInfraprodalbsg2960D4B48057A0CF64": {
+      "Type": "AWS::EC2::SecurityGroupIngress",
+      "Properties": {
+        "IpProtocol": "tcp",
+        "Description": "Load balancer to target",
+        "FromPort": 80,
+        "GroupId": {
+          "Fn::GetAtt": [
+            "serviceSecurityGroupF051F0EB",
+            "GroupId"
+          ]
+        },
+        "SourceSecurityGroupId": {
+          "Fn::ImportValue": "baseInfra-prod:ExportsOutputFnGetAttalbsg40B076C4GroupId00309A0E"
+        },
+        "ToPort": 80
+      },
+      "Metadata": {
+        "aws:cdk:path": "service-sample-without-cognito-prod/service/SecurityGroup/from baseInfraprodalbsg2960D4B4:80"
+      }
+    },
+    "serviceSecurityGroupbaseInfraprodalbsg2960D4B480from1B1F44EE": {
+      "Type": "AWS::EC2::SecurityGroupEgress",
+      "Properties": {
+        "GroupId": {
+          "Fn::ImportValue": "baseInfra-prod:ExportsOutputFnGetAttalbsg40B076C4GroupId00309A0E"
+        },
+        "IpProtocol": "tcp",
+        "Description": "Load balancer to target",
+        "DestinationSecurityGroupId": {
+          "Fn::GetAtt": [
+            "serviceSecurityGroupF051F0EB",
+            "GroupId"
+          ]
+        },
+        "FromPort": 80,
+        "ToPort": 80
+      },
+      "Metadata": {
+        "aws:cdk:path": "service-sample-without-cognito-prod/service/SecurityGroup/baseInfraprodalbsg2960D4B4:80 from"
+      }
+    },

```