import * as cdk from '@aws-cdk/core'

import * as cognito from '@aws-cdk/aws-cognito'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as ecs from '@aws-cdk/aws-ecs'
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2'
import * as elbv2Actions from '@aws-cdk/aws-elasticloadbalancingv2-actions'
import * as route53 from '@aws-cdk/aws-route53'
import * as route53Targets from '@aws-cdk/aws-route53-targets'

export interface BaseInfraStackProps extends cdk.StackProps {
  envName: string;
  region: string;
}

export class BaseInfraStack extends cdk.Stack {

  public readonly vpc: ec2.IVpc
  public readonly cluster: ecs.ICluster
  public readonly targetGroups: {
    [key: string]: elbv2.ApplicationTargetGroup;
  } = {}
  public readonly congitoUserPool: cognito.IUserPool;
  public readonly congitoUserPoolClient: cognito.IUserPoolClient;

  public readonly albSG: ec2.ISecurityGroup;

  constructor(scope: cdk.Construct, id: string, props: BaseInfraStackProps) {
    super(scope, id, props)

    // Config
    const context: any = this.node.tryGetContext(props.envName)
    const domainNames: string[] = context.domainNames

    type ServiceType = {
      domain: string;
      subDomain: string;
      healthCheckRoute: string;
      useCognito: boolean;
    }
    const services: {
      [key: string]: ServiceType;
    } = {}

    for (const serviceName in context.services) {
      const service = context.services[serviceName]
      services[serviceName] = {
        domain: service.domain,
        subDomain: service.subDomain,
        healthCheckRoute: service.healthCheckRoute || '/',
        useCognito: service.cognito || false
      }
    }

    type CognitoConfig = {
      domain: string;
      subDomain: string;
    }
    const cognitoConfig: CognitoConfig = context.cognito

    // Create a VPC
    this.vpc = new ec2.Vpc(this, `vpc-${props.envName}`, {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{
        cidrMask: 24,
        name: 'Ingress',
        subnetType: ec2.SubnetType.PUBLIC,
      },
      {
        cidrMask: 24,
        name: 'Database',
        subnetType: ec2.SubnetType.ISOLATED,
      }]
    })


    // Create a ECS Cluster
    const cluster =  new ecs.Cluster(this, `cluster-${props.envName}`, {
      clusterName: `${props.envName}-sample-cluster`,
      vpc: this.vpc,
    })
    this.cluster = cluster

    // Application Load Balancer
    const albSecurityGroup = new ec2.SecurityGroup(this, 'alb-sg', {
      vpc: this.vpc,
      allowAllOutbound: false,
    })
    albSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Required by Idp Auth (cognito)')
    this.albSG = albSecurityGroup // PATCH:  When using congito ALB Security Group will not be connected to Security Group of service  see: https://github.com/aws/aws-cdk/issues/12994
    const alb = new elbv2.ApplicationLoadBalancer(this, `alb-${props.envName}`, {
      vpc: this.vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup
    })


    // Cognito to use with ALB
    const userPool = new cognito.UserPool(this, 'user-pool', {
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(3),
      },
      selfSignUpEnabled: false,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    })
    this.congitoUserPool = userPool

    // Add domain
    const userPoolDomain = userPool.addDomain('cognito-domain', {
      cognitoDomain: {
        domainPrefix: `this-is-a-sample-${props.envName}`,
      }
    })


    const userPoolClientAlb = userPool.addClient('user-pool-client-alb', {
      // Required minimal configuration for use with an ELB
      generateSecret: true,
      authFlows: {
        userPassword: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.EMAIL],
      },
      refreshTokenValidity: cdk.Duration.days(30),
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO
      ]
    })
    this.congitoUserPoolClient = userPoolClientAlb


    // Listner
    const listner = alb.addListener(`listener-https-${props.envName}`, {
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.fixedResponse(200,{})
    })

    let serviceListnerPriority = 100
    for (const serviceName in services) {
      const service = services[serviceName]

      // Create targetgroup
      const targetgroup = new elbv2.ApplicationTargetGroup(this, `${serviceName}-target-group-${props.envName}`, {
        vpc: this.vpc,
        port: 80,
        targetType: elbv2.TargetType.IP
      })
      targetgroup.configureHealthCheck({
        path: service.healthCheckRoute
      })

      this.targetGroups[serviceName] = targetgroup

      let action = elbv2.ListenerAction.forward([targetgroup])
      if (service.useCognito) {

        // https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-authenticate-users.html
        // Note about how to handle it in container https://www.kdgregory.com/index.php?page=aws.albCognito
        action = new elbv2Actions.AuthenticateCognitoAction({
          userPool: userPool,
          userPoolClient: userPoolClientAlb,
          userPoolDomain: userPoolDomain,
          next: action,
        })
      }
      // Add rule to redirect to targetgroup
      listner.addAction(`${serviceName}-listner-action-${props.envName}`, {
        priority: serviceListnerPriority,
        hostHeader: service.subDomain ? `${service.subDomain}.${service.domain}` : service.domain,
        action: action
      })

      serviceListnerPriority += 100
    }
  }

}
